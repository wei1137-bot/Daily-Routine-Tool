import path from 'node:path'
import fs from 'node:fs'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, session, shell, Tray } from 'electron'
import { DatabaseService } from './database'
import { BRIGHTSPACE_SESSION_PARTITION, BrightspaceService } from './brightspace'
import { GRADESCOPE_SESSION_PARTITION, GradescopeService } from './gradescope'
import { recognizeScheduleImage } from './schedule-ocr'
import { CredentialStore } from './credential-store'
import { canonicalAppDataRoot, prepareStableUserData } from './user-data'
import { trayLabels } from './tray-menu'
import { macApplicationMenuTemplate } from './app-menu'
import { hidesMainWindowOnClose, usesMacApplicationMenu } from './platform'
import { assertTesseractLanguageData, runtimeAssetPath, tesseractLanguagePath } from './runtime-resources'

let database: DatabaseService
let brightspace: BrightspaceService
let gradescope: GradescopeService
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let quitPrepared = false
let quitPreparation: Promise<void> | null = null
let brightspaceSyncInFlight: Promise<ReturnType<DatabaseService['importBrightspace']>> | null = null
let gradescopeSyncInFlight: Promise<ReturnType<DatabaseService['importGradescope']>> | null = null
let dailyRefreshTimer: NodeJS.Timeout | null = null
const DAILY_REFRESH_MS = 24 * 60 * 60 * 1000
const DAILY_REFRESH_CHECK_MS = 60 * 60 * 1000

function writeStartupDiagnostic(message: string) {
  try {
    const logPath = path.join(app.getPath('logs'), 'startup.log')
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`)
  } catch { /* Startup diagnostics must never prevent the app from opening. */ }
}

const resourceContext = () => ({
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  appRoot: path.join(__dirname, '..')
})

const assetPath = (name: string) => runtimeAssetPath(name, resourceContext())

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false
  mainWindow.show()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
  return true
}

async function showOrCreateWindow() {
  if (!showWindow() && database) await createWindow()
}

async function prepareToQuit() {
  isQuitting = true
  if (dailyRefreshTimer) clearInterval(dailyRefreshTimer)
  if (app.isReady()) {
    await Promise.allSettled([
      session.fromPartition(BRIGHTSPACE_SESSION_PARTITION).flushStorageData(),
      session.fromPartition(GRADESCOPE_SESSION_PARTITION).flushStorageData()
    ])
  }
  quitPrepared = true
}

function requestQuit() {
  if (quitPrepared) { app.quit(); return }
  quitPreparation ??= prepareToQuit()
  void quitPreparation.finally(() => app.quit())
}

async function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) { showWindow(); return }
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 650,
    icon: assetPath(process.platform === 'win32' ? 'icon.ico' : 'app-icon.png'),
    backgroundColor: '#f7f8fa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Keep Chromium's docked developer-tools pane out of production. If it is
      // opened accidentally it reduces the renderer viewport and can look like
      // a large blank block covering the lower half of the app.
      devTools: !app.isPackaged
    }
  })
  if (!usesMacApplicationMenu()) mainWindow.setMenuBarVisibility(false)
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.on('close', (event) => {
    if (!isQuitting && hidesMainWindowOnClose()) { event.preventDefault(); mainWindow?.hide() }
  })
  mainWindow.on('closed', () => { mainWindow = null })
  if (process.env.VITE_DEV_SERVER_URL) await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  else await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

function createTray() {
  if (tray) return
  const traySize = usesMacApplicationMenu() ? 18 : 20
  const trayImage = nativeImage.createFromPath(assetPath('app-icon.png')).resize({ width: traySize, height: traySize })
  if (usesMacApplicationMenu()) trayImage.setTemplateImage(true)
  tray = new Tray(trayImage)
  tray.setToolTip('Daily Routine')
  updateTrayMenu()
  if (!usesMacApplicationMenu()) {
    tray.on('click', () => { void showOrCreateWindow() })
    tray.on('double-click', () => { void showOrCreateWindow() })
  }
}

function updateTrayMenu(language = database.getState().settings.language) {
  if (!tray) return
  const labels = trayLabels(language)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: labels.open, click: () => { void showOrCreateWindow() } },
    { type: 'separator' },
    { label: labels.quit, click: requestQuit }
  ]))
}

function runBrightspaceSync(baseUrl: string) {
  if (brightspaceSyncInFlight) return brightspaceSyncInFlight
  const timezone = database.getState().settings.defaultTimezone ?? 'America/Indiana/Indianapolis'
  brightspaceSyncInFlight = brightspace.sync(baseUrl, timezone).then((payload) => {
    const result = database.importBrightspace(payload)
    brightspace.recordImportSummary(result.summary)
    return result
  }).finally(() => { brightspaceSyncInFlight = null })
  return brightspaceSyncInFlight
}

async function autoSyncBrightspace() {
  const settings = database.getState().settings
  const baseUrl = settings.brightspaceBaseUrl
  if (!baseUrl) return
  try {
    const result = await runBrightspaceSync(baseUrl)
    mainWindow?.webContents.send('brightspace:sync-complete', result)
  } catch (error) {
    mainWindow?.webContents.send('brightspace:sync-error', error instanceof Error ? error.message : String(error))
  }
}

function runGradescopeSync() {
  if (gradescopeSyncInFlight) return gradescopeSyncInFlight
  const state = database.getState()
  const timezone = state.settings.defaultTimezone ?? 'America/Indiana/Indianapolis'
  gradescopeSyncInFlight = gradescope.sync(timezone, state.courses.map((course) => ({
    code: String(course.code ?? ''), name: String(course.name ?? '')
  }))).then((payload) => {
    const result = database.importGradescope(payload)
    gradescope.recordImportSummary(result.summary)
    return result
  }).finally(() => { gradescopeSyncInFlight = null })
  return gradescopeSyncInFlight
}

async function autoSyncGradescope() {
  if (database.getState().settings.gradescopeAutoSync !== 'true') return
  try {
    const result = await runGradescopeSync()
    mainWindow?.webContents.send('gradescope:sync-complete', result)
  } catch (error) {
    mainWindow?.webContents.send('gradescope:sync-error', error instanceof Error ? error.message : String(error))
  }
}

function dailyRefreshDue(value?: string) {
  if (!value) return true
  const timestamp = Date.parse(value)
  return !Number.isFinite(timestamp) || Date.now() - timestamp >= DAILY_REFRESH_MS
}

async function runDailyRefresh() {
  const settings = database.getState().settings
  const jobs: Promise<void>[] = []
  const stamp = new Date().toISOString()
  const brightspaceReference = settings.brightspaceLastAutoSyncAttemptAt || settings.brightspaceLastSyncAt
  if (settings.brightspaceBaseUrl && dailyRefreshDue(brightspaceReference)) {
    database.saveSetting({ key: 'brightspaceLastAutoSyncAttemptAt', value: stamp })
    jobs.push(autoSyncBrightspace())
  }
  const gradescopeReference = settings.gradescopeLastAutoSyncAttemptAt || settings.gradescopeLastSyncAt
  if (settings.gradescopeAutoSync === 'true' && dailyRefreshDue(gradescopeReference)) {
    database.saveSetting({ key: 'gradescopeLastAutoSyncAttemptAt', value: stamp })
    jobs.push(autoSyncGradescope())
  }
  await Promise.all(jobs)
}

const userData = prepareStableUserData(canonicalAppDataRoot(app.getPath('appData'), app.getPath('home')))
app.setPath('userData', userData.stablePath)
const hasLock = app.requestSingleInstanceLock()
writeStartupDiagnostic(`module loaded; single-instance lock=${hasLock ? 'acquired' : 'unavailable'}`)
if (userData.databaseMigrated) writeStartupDiagnostic(`migrated legacy database from ${userData.legacyDatabase}`)
if (!hasLock) { isQuitting = true; app.quit() }
else {
  app.setAppUserModelId('com.dailyroutine.desktop')
  app.on('second-instance', (_event, argv) => {
    if (argv.includes('--quit-for-update')) requestQuit()
    else void showOrCreateWindow()
  })
  app.whenReady().then(async () => {
    if (usesMacApplicationMenu()) {
      Menu.setApplicationMenu(Menu.buildFromTemplate(macApplicationMenuTemplate(app.isPackaged)))
      if (!app.isPackaged) app.dock?.setIcon(assetPath('logo.png'))
    }
    const databasePath = userData.stableDatabase
    database = await DatabaseService.create(databasePath)
    const initialState = database.getState()
    writeStartupDiagnostic(`database opened; path=${databasePath}; courses=${initialState.courses.length}; meetings=${initialState.meetings.length}; events=${initialState.events.length}; language=${initialState.settings.language ?? 'unset'}`)
    brightspace = new BrightspaceService(
      path.join(app.getPath('logs'), 'brightspace.log'),
      path.join(app.getPath('userData'), 'brightspace-syllabi')
    )
    gradescope = new GradescopeService(
      path.join(app.getPath('logs'), 'gradescope.log'),
      new CredentialStore(path.join(app.getPath('userData'), 'gradescope-credentials.json'))
    )
    createTray()
    await createWindow()
    void runDailyRefresh()
    dailyRefreshTimer = setInterval(() => { void runDailyRefresh() }, DAILY_REFRESH_CHECK_MS)
  }).catch((error) => {
    const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)
    try {
      writeStartupDiagnostic(message)
    } catch { /* Avoid hiding the original startup failure. */ }
    console.error('Daily Routine startup failed:', error)
    app.quit()
  })
}
app.on('before-quit', (event) => {
  if (quitPrepared) return
  event.preventDefault()
  requestQuit()
})
app.on('window-all-closed', () => { /* Windows stays in the tray; macOS stays available from the Dock/menu bar. */ })
app.on('activate', () => { void showOrCreateWindow() })

ipcMain.handle('db:get-state', () => database.getState())
ipcMain.handle('db:save-course', (_e, value) => database.saveCourse(value))
ipcMain.handle('db:delete-course', (_e, id) => database.deleteCourse(id))
ipcMain.handle('db:save-event', (_e, value) => database.saveEvent(value))
ipcMain.handle('db:save-event-status', (_e, value) => database.saveEventStatus(value))
ipcMain.handle('db:delete-event', (_e, id) => database.deleteEvent(id))
ipcMain.handle('db:save-syllabus', (_e, value) => database.saveSyllabus(value))
ipcMain.handle('db:save-grading-items', (_e, value) => database.saveGradingItems(value))
ipcMain.handle('db:save-schedule', (_e, value) => database.saveSchedule(value))
ipcMain.handle('db:save-event-plans', (_e, value) => database.saveEventPlans(value))
ipcMain.handle('db:save-detected', (_e, value) => database.saveDetected(value))
ipcMain.handle('db:resolve-detected', (_e, value) => database.resolveDetected(value))
ipcMain.handle('db:save-setting', (_e, value) => {
  const state = database.saveSetting(value)
  if (value?.key === 'language') updateTrayMenu(state.settings.language)
  return state
})
ipcMain.handle('db:reset-demo', () => database.resetDemo())
ipcMain.handle('db:get-path', () => database.filePath)
ipcMain.handle('brightspace:status', (_e, baseUrl: string) => brightspace.getStatus(baseUrl))
ipcMain.handle('brightspace:connect', (_e, baseUrl: string) => brightspace.connect(baseUrl))
ipcMain.handle('brightspace:disconnect', (_e, baseUrl: string) => brightspace.disconnect(baseUrl))
ipcMain.handle('brightspace:get-log-path', () => brightspace.logPath)
ipcMain.handle('brightspace:sync', async (_e, baseUrl: string) => {
  return runBrightspaceSync(baseUrl)
})
ipcMain.handle('gradescope:status', () => gradescope.getStatus())
ipcMain.handle('gradescope:connect', () => gradescope.connect())
ipcMain.handle('gradescope:disconnect', async () => {
  const status = await gradescope.disconnect()
  database.saveSetting({ key: 'gradescopeAutoSync', value: false })
  return status
})
ipcMain.handle('gradescope:get-log-path', () => gradescope.logPath)
ipcMain.handle('gradescope:sync', () => runGradescopeSync())
ipcMain.handle('gradescope:auto-login-status', () => gradescope.getAutoLoginStatus())
ipcMain.handle('gradescope:configure-auto-login', async (_e, value: { email: string; password: string }) => {
  try {
    const status = await gradescope.configureAutoLogin(value)
    database.saveSetting({ key: 'gradescopeAutoLogin', value: true })
    database.saveSetting({ key: 'gradescopeAutoSync', value: true })
    return status
  } catch (error) {
    database.saveSetting({ key: 'gradescopeAutoLogin', value: false })
    throw error
  }
})
ipcMain.handle('gradescope:disable-auto-login', () => {
  const status = gradescope.disableAutoLogin()
  database.saveSetting({ key: 'gradescopeAutoLogin', value: false })
  return status
})
ipcMain.handle('file:choose-syllabus', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'PDF syllabus', extensions: ['pdf'] }] })
  if (result.canceled || !result.filePaths[0]) return null
  return { filePath: result.filePaths[0], fileName: path.basename(result.filePaths[0]) }
})
ipcMain.handle('file:open-path', async (_e, filePath: string) => shell.openPath(filePath))
ipcMain.handle('schedule:recognize-image', async (_e, payload: { bytes: Uint8Array; name: string }) => {
  const bytes = Buffer.from(payload.bytes)
  if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new Error('Please choose an image smaller than 15 MB.')
  const englishData = require('@tesseract.js-data/eng') as { langPath: string }
  const langPath = tesseractLanguagePath(resourceContext(), englishData.langPath)
  assertTesseractLanguageData(langPath)
  return recognizeScheduleImage(bytes, payload.name, database.getState().courses.map((course) => String(course.code)), langPath)
})
