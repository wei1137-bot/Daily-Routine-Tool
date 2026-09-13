import fs from 'node:fs'
import path from 'node:path'

export const STABLE_USER_DATA_DIRECTORY = 'Daily Routine'
export const LEGACY_USER_DATA_DIRECTORY = 'daily-routine'

export function canonicalAppDataRoot(
  fallbackAppDataPath: string,
  homeDirectory: string,
  platform = process.platform,
  environmentAppData = process.env.APPDATA
) {
  // Electron can inherit virtualized paths when launched as a child of a
  // packaged development tool. APPDATA still identifies the normal Windows
  // roaming profile used by dev, installed, and unpacked builds.
  if (platform === 'win32' && environmentAppData && /^[a-z]:[\\/]/i.test(environmentAppData)) {
    return path.normalize(environmentAppData)
  }
  if (platform === 'win32' && /^[a-z]:[\\/]/i.test(homeDirectory)) {
    return path.join(homeDirectory, 'AppData', 'Roaming')
  }
  return fallbackAppDataPath
}

export function prepareStableUserData(appDataPath: string) {
  const stablePath = path.join(appDataPath, STABLE_USER_DATA_DIRECTORY)
  const legacyPath = path.join(appDataPath, LEGACY_USER_DATA_DIRECTORY)
  const stableDatabase = path.join(stablePath, 'daily-routine.sqlite')
  const legacyDatabase = path.join(legacyPath, 'daily-routine.sqlite')
  let databaseMigrated = false

  fs.mkdirSync(stablePath, { recursive:true })
  if (!fs.existsSync(stableDatabase) && isSqliteDatabase(legacyDatabase)) {
    copyFileAtomically(legacyDatabase, stableDatabase)
    databaseMigrated = true
  }

  const legacyCredentials = path.join(legacyPath, 'gradescope-credentials.json')
  const stableCredentials = path.join(stablePath, 'gradescope-credentials.json')
  if (!fs.existsSync(stableCredentials) && fs.existsSync(legacyCredentials)) {
    copyFileAtomically(legacyCredentials, stableCredentials)
  }

  return { stablePath, legacyPath, stableDatabase, legacyDatabase, databaseMigrated }
}

function isSqliteDatabase(filePath: string) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 16) return false
  const descriptor = fs.openSync(filePath, 'r')
  try {
    const header = Buffer.alloc(16)
    fs.readSync(descriptor, header, 0, header.length, 0)
    return header.toString('utf8') === 'SQLite format 3\0'
  } finally {
    fs.closeSync(descriptor)
  }
}

function copyFileAtomically(source: string, destination: string) {
  const temporaryPath = `${destination}.importing`
  try {
    fs.copyFileSync(source, temporaryPath)
    fs.renameSync(temporaryPath, destination)
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force:true })
  }
}
