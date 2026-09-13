import { useEffect, useState } from 'react'
import { Cloud, Database, FileText, GraduationCap, KeyRound, Link2, Loader2, Mail, Monitor, RefreshCw, RotateCcw, ShieldCheck, Type, Unplug } from 'lucide-react'
import type { AppState, BrightspaceStatus, Course, GradescopeAutoLoginStatus, GradescopeStatus } from '../domain/types'
import { useI18n } from '../i18n'
import { Modal } from '../components/Modal'

const DEFAULT_BRIGHTSPACE_URL = 'https://purdue.brightspace.com'
const accentColors = ['#536faf','#68718f','#547b76','#806e86','#89745f']
const normalizedZoom = (value?: string) => value === undefined || value === '' ? 100
  : Math.min(130, Math.max(80, Number.isFinite(Number(value)) ? Math.round(Number(value)) : 100))

export function SettingsPage({ courses, settings, onSaveSetting, onStateChange, onReset }: {
  courses: Course[]
  settings: Record<string,string>
  onSaveSetting: (key:string,value:string|boolean) => Promise<void>
  onStateChange: (state: AppState) => void
  onReset: () => void
}) {
  const { language, t } = useI18n()
  const [dataPath, setDataPath] = useState('Loading…')
  const [baseUrl, setBaseUrl] = useState(settings.brightspaceBaseUrl ?? DEFAULT_BRIGHTSPACE_URL)
  const [brightspaceStatus, setBrightspaceStatus] = useState<BrightspaceStatus>()
  const [busy, setBusy] = useState<'connect' | 'sync' | 'disconnect'>()
  const [message, setMessage] = useState<string>()
  const [integrationError, setIntegrationError] = useState<string>()
  const [logPath, setLogPath] = useState<string>()
  const [gradescopeStatus, setGradescopeStatus] = useState<GradescopeStatus>()
  const [gradescopeBusy, setGradescopeBusy] = useState<'connect' | 'sync' | 'disconnect'>()
  const [gradescopeMessage, setGradescopeMessage] = useState<string>()
  const [gradescopeError, setGradescopeError] = useState<string>()
  const [gradescopeLogPath, setGradescopeLogPath] = useState<string>()
  const [autoLoginStatus, setAutoLoginStatus] = useState<GradescopeAutoLoginStatus>()
  const [showCredentials, setShowCredentials] = useState(false)
  const [credentialEmail, setCredentialEmail] = useState('')
  const [credentialPassword, setCredentialPassword] = useState('')
  const [credentialBusy, setCredentialBusy] = useState(false)
  const [credentialError, setCredentialError] = useState<string>()
  const [windowPreferences, setWindowPreferences] = useState<Awaited<ReturnType<typeof window.dailyRoutine.getWindowPreferences>>>()
  const [editingWindowSize, setEditingWindowSize] = useState(false)
  const [savingWindowSize, setSavingWindowSize] = useState(false)
  const [zoomPercent, setZoomPercent] = useState(() => normalizedZoom(settings.appZoomPercent))

  useEffect(() => { window.dailyRoutine.getDataPath().then(setDataPath) }, [])
  useEffect(() => { window.dailyRoutine.getBrightspaceLogPath().then(setLogPath) }, [])
  useEffect(() => { window.dailyRoutine.getGradescopeLogPath().then(setGradescopeLogPath) }, [])
  useEffect(() => { window.dailyRoutine.getGradescopeAutoLoginStatus().then(setAutoLoginStatus).catch((error) => setGradescopeError(errorMessage(error))) }, [])
  useEffect(() => { window.dailyRoutine.getWindowPreferences().then(setWindowPreferences) }, [])
  useEffect(() => { setZoomPercent(normalizedZoom(settings.appZoomPercent)) }, [settings.appZoomPercent])
  useEffect(() => {
    if (!editingWindowSize) return
    const refresh = () => { void window.dailyRoutine.getWindowPreferences().then(setWindowPreferences) }
    refresh()
    const timer = window.setInterval(refresh, 250)
    return () => window.clearInterval(timer)
  }, [editingWindowSize])
  useEffect(() => {
    let active = true
    window.dailyRoutine.getBrightspaceStatus(baseUrl)
      .then((status) => { if (active) setBrightspaceStatus(status) })
      .catch((error) => { if (active) setIntegrationError(errorMessage(error)) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    let active = true
    window.dailyRoutine.getGradescopeStatus()
      .then((status) => { if (active) setGradescopeStatus(status) })
      .catch((error) => { if (active) setGradescopeError(errorMessage(error)) })
    return () => { active = false }
  }, [])

  const saveUrl = async () => { await onSaveSetting('brightspaceBaseUrl', baseUrl.trim()) }

  const startWindowSizeEdit = async () => {
    setWindowPreferences(await window.dailyRoutine.getWindowPreferences())
    setEditingWindowSize(true)
  }

  const finishWindowSizeEdit = async () => {
    setSavingWindowSize(true)
    try {
      const current = await window.dailyRoutine.getWindowPreferences()
      await onSaveSetting('defaultWindowWidth', String(current.currentWidth))
      await onSaveSetting('defaultWindowHeight', String(current.currentHeight))
      setWindowPreferences({ ...current, defaultWidth:current.currentWidth, defaultHeight:current.currentHeight })
      setEditingWindowSize(false)
    } finally { setSavingWindowSize(false) }
  }

  const previewZoom = (value: number) => {
    setZoomPercent(value)
  }

  const saveZoom = async (value: number) => {
    const normalized = await window.dailyRoutine.previewWindowZoom(value)
    setZoomPercent(normalized)
    if (settings.appZoomPercent !== String(normalized)) await onSaveSetting('appZoomPercent', String(normalized))
  }

  const applySync = async () => {
    const result = await window.dailyRoutine.syncBrightspace(baseUrl)
    onStateChange(result.state)
    setBrightspaceStatus({ connected: true, baseUrl, message: language === 'zh' ? 'Brightspace 会话已连接' : 'Brightspace session is connected' })
    const summary = result.summary
    const cleanup = summary.coursesRemoved ? ` Removed ${summary.coursesRemoved} empty course${summary.coursesRemoved === 1 ? '' : 's'} imported by the previous sync.` : ''
    const dueItems = summary.itemsFound - summary.itemsWithoutDueDate
    setMessage(language === 'zh'
      ? `Brightspace 返回 ${summary.enrolledCourses} 项注册记录，保留 ${summary.coursesFound} 门当前课程；新增 ${summary.itemsAdded} 项、更新 ${summary.itemsUpdated}/${dueItems} 项截止日期；导入 ${summary.syllabiImported}/${summary.syllabiFound} 份课程大纲，并加入 ${summary.syllabusEventsAdded} 个考试日期。`
      : `Brightspace returned ${summary.enrolledCourses} enrollments. Kept ${summary.coursesFound} current academic courses; skipped ${summary.skippedByAccessWindow} ended/not-started, ${summary.skippedNonAcademic} non-course items, and ${summary.inaccessibleCourses} inaccessible. Added ${summary.itemsAdded} and updated ${summary.itemsUpdated} of ${dueItems} deadlines directly. Imported ${summary.syllabiImported} of ${summary.syllabiFound} syllabi and added ${summary.syllabusEventsAdded} syllabus exam date(s).${cleanup}`)
  }

  const connect = async () => {
    setBusy('connect'); setIntegrationError(undefined); setMessage(language === 'zh' ? '请在 Brightspace 窗口完成登录和 MFA…' : 'Complete sign-in and MFA in the Brightspace window…')
    try {
      await saveUrl()
      const status = await window.dailyRoutine.connectBrightspace(baseUrl)
      setBrightspaceStatus(status)
      setMessage(language === 'zh' ? '已连接，正在读取课程、作业与测验…' : 'Connected. Reading courses, assignments, and quizzes…')
      await applySync()
    } catch (error) {
      setMessage(undefined); setIntegrationError(errorMessage(error))
    } finally { setBusy(undefined) }
  }

  const sync = async () => {
    setBusy('sync'); setIntegrationError(undefined); setMessage(language === 'zh' ? '正在读取 Brightspace…' : 'Reading Brightspace…')
    try { await saveUrl(); await applySync() }
    catch (error) { setMessage(undefined); setIntegrationError(errorMessage(error)) }
    finally { setBusy(undefined) }
  }

  const disconnect = async () => {
    if (!confirm(language === 'zh' ? '在此电脑上断开 Brightspace？已导入的课程和截止日期将保留。' : 'Disconnect Brightspace on this computer? Imported courses and deadlines will remain.')) return
    setBusy('disconnect'); setIntegrationError(undefined); setMessage(undefined)
    try { setBrightspaceStatus(await window.dailyRoutine.disconnectBrightspace(baseUrl)); setMessage(language === 'zh' ? 'Brightspace 会话已移除，导入的数据已保留。' : 'Brightspace session removed. Imported data was kept.') }
    catch (error) { setIntegrationError(errorMessage(error)) }
    finally { setBusy(undefined) }
  }

  const lastSync = settings.brightspaceLastSyncAt ? new Date(settings.brightspaceLastSyncAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US') : t('never')
  const gradescopeLastSync = settings.gradescopeLastSyncAt ? new Date(settings.gradescopeLastSyncAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US') : t('never')

  const applyGradescopeSync = async () => {
    const result = await window.dailyRoutine.syncGradescope()
    onStateChange(result.state)
    setGradescopeStatus({ connected: true, message: language === 'zh' ? 'Gradescope 会话已连接' : 'Gradescope session is connected' })
    const summary = result.summary
    const dueItems = summary.itemsFound - summary.itemsWithoutDueDate
    setGradescopeMessage(language === 'zh'
      ? `匹配后纳入 ${summary.currentCourses}/${summary.coursesFound} 门课程；新增 ${summary.itemsAdded} 项、更新 ${summary.itemsUpdated}/${dueItems} 项截止日期，跳过 ${summary.duplicatesSkipped} 个重复项。`
      : `Included ${summary.currentCourses} of ${summary.coursesFound} courses after term and existing-course matching. Added ${summary.itemsAdded} and updated ${summary.itemsUpdated} of ${dueItems} deadlines; skipped ${summary.duplicatesSkipped} duplicates.`)
  }

  const connectGradescope = async () => {
    setGradescopeBusy('connect'); setGradescopeError(undefined); setGradescopeMessage(language === 'zh' ? '请在 Gradescope 窗口完成登录…' : 'Complete sign-in in the Gradescope window…')
    try {
      setGradescopeStatus(await window.dailyRoutine.connectGradescope())
      setGradescopeMessage(language === 'zh' ? '已连接，正在读取当前课程和作业截止日期…' : 'Connected. Reading current courses and assignment deadlines…')
      await applyGradescopeSync()
    } catch (error) {
      setGradescopeMessage(undefined); setGradescopeError(errorMessage(error))
    } finally { setGradescopeBusy(undefined) }
  }

  const syncGradescope = async () => {
    setGradescopeBusy('sync'); setGradescopeError(undefined); setGradescopeMessage(language === 'zh' ? '正在读取 Gradescope…' : 'Reading Gradescope…')
    try { await applyGradescopeSync() }
    catch (error) { setGradescopeMessage(undefined); setGradescopeError(errorMessage(error)) }
    finally { setGradescopeBusy(undefined) }
  }

  const disconnectGradescope = async () => {
    if (!confirm(language === 'zh' ? '在此电脑上断开 Gradescope？已导入的截止日期将保留。' : 'Disconnect Gradescope on this computer? Imported deadlines will remain.')) return
    setGradescopeBusy('disconnect'); setGradescopeError(undefined); setGradescopeMessage(undefined)
    try {
      setGradescopeStatus(await window.dailyRoutine.disconnectGradescope())
      setGradescopeMessage(language === 'zh' ? 'Gradescope 会话已移除，导入的截止日期已保留。' : 'Gradescope session removed. Imported deadlines were kept.')
    } catch (error) { setGradescopeError(errorMessage(error)) }
    finally { setGradescopeBusy(undefined) }
  }

  const saveAutoLogin = async () => {
    setCredentialBusy(true); setCredentialError(undefined); setGradescopeError(undefined)
    try {
      const status = await window.dailyRoutine.configureGradescopeAutoLogin({ email: credentialEmail, password: credentialPassword })
      setAutoLoginStatus(status)
      setCredentialPassword('')
      setShowCredentials(false)
      setGradescopeMessage(language === 'zh' ? '自动登录已验证并加密保存，正在同步 Gradescope…' : 'Automatic login verified and encrypted. Syncing Gradescope…')
      await applyGradescopeSync()
    } catch (error) {
      setCredentialError(errorMessage(error))
    } finally { setCredentialBusy(false) }
  }

  const disableAutoLogin = async () => {
    setCredentialError(undefined); setGradescopeError(undefined)
    try {
      setAutoLoginStatus(await window.dailyRoutine.disableGradescopeAutoLogin())
      setCredentialEmail(''); setCredentialPassword('')
      setGradescopeMessage(language === 'zh' ? '自动登录已关闭，加密凭据已删除。' : 'Automatic login disabled and encrypted credentials removed.')
    } catch (error) { setGradescopeError(errorMessage(error)) }
  }

  return <div className="page settings-page"><header className="page-header"><div><p className="eyebrow">{t('preferences')}</p><h1>{t('settings')}</h1><p className="subtitle">{t('settingsSubtitle')}</p></div></header>
    <div className="settings-stack">
      <section className="settings-section"><div className="settings-icon"><ShieldCheck size={20}/></div><div className="settings-content"><h2>{t('general')}</h2><p>{t('generalHint')}</p>
        <label>{t('defaultTimezone')}<select value={settings.defaultTimezone ?? 'America/Indiana/Indianapolis'} onChange={(e) => void onSaveSetting('defaultTimezone',e.target.value)}><option>America/Indiana/Indianapolis</option><option>America/New_York</option><option>America/Chicago</option><option>America/Denver</option><option>America/Los_Angeles</option><option>Asia/Shanghai</option><option>UTC</option></select></label>
        <label>{t('language')}<select value={language} onChange={(event) => void onSaveSetting('language',event.target.value)}><option value="en">{t('english')}</option><option value="zh">{t('chinese')}</option></select></label>
        <div className="display-settings"><h3>{t('displaySettings')}</h3>
          <div className={`display-setting-row ${editingWindowSize ? 'editing' : ''}`}><Monitor size={17}/><div><strong>{t('defaultWindowSize')}</strong><span>{windowPreferences ? `${editingWindowSize ? windowPreferences.currentWidth : windowPreferences.defaultWidth} × ${editingWindowSize ? windowPreferences.currentHeight : windowPreferences.defaultHeight}` : '—'}</span></div>
            <button className={`button ${editingWindowSize ? 'primary' : 'secondary'}`} disabled={savingWindowSize} onClick={() => void (editingWindowSize ? finishWindowSizeEdit() : startWindowSizeEdit())}>{editingWindowSize ? t('finishWindowSize') : t('editWindowSize')}</button>
          </div>
          {editingWindowSize && <p className="window-size-edit-hint">{t('resizeWindowHint')}</p>}
          <label className="font-size-setting"><Type size={17}/><div><strong>{t('fontSize')}</strong><span>{t('fontSizeHint')}</span></div><div className="font-size-control"><input type="range" min="80" max="130" step="5" value={zoomPercent} aria-label={t('fontSize')} onChange={(event) => previewZoom(Number(event.target.value))} onPointerUp={(event) => void saveZoom(Number(event.currentTarget.value))} onKeyUp={(event) => void saveZoom(Number(event.currentTarget.value))} onBlur={(event) => void saveZoom(Number(event.currentTarget.value))}/><output>{zoomPercent}%</output></div></label>
        </div>
        <fieldset className="settings-accent-picker"><legend>{t('appAccent')}</legend><div className="color-options">{accentColors.map((color) => <button type="button" key={color} className={`color-choice ${settings.appAccentColor === color || (!settings.appAccentColor && color === accentColors[0]) ? 'selected' : ''}`} style={{background:color}} aria-label={color} onClick={() => void onSaveSetting('appAccentColor',color)}/>)}<label className="custom-color-control" title={t('custom')}><span className="custom-color-swatch" style={settings.appAccentColor ? {background:settings.appAccentColor} : undefined}/><span>{t('custom')}</span><input className="custom-color-input" type="color" aria-label={t('custom')} value={/^#[0-9a-f]{6}$/i.test(settings.appAccentColor ?? '') ? settings.appAccentColor : '#536faf'} onChange={(event) => void onSaveSetting('appAccentColor',event.target.value)}/></label></div></fieldset>
        <label className="switch-label setting-toggle"><input type="checkbox" checked={settings.hideCompleted === 'true'} onChange={(e) => void onSaveSetting('hideCompleted',e.target.checked)}/><span className="switch"/>{t('hideCompletedDefault')}</label></div></section>
      <section className="settings-section"><div className="settings-icon"><Cloud size={20}/></div><div className="settings-content"><h2>Brightspace</h2><p>{t('brightspaceHint')}</p>
        <label>{t('brightspaceAddress')}<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} onBlur={() => void saveUrl()} placeholder={DEFAULT_BRIGHTSPACE_URL}/></label>
        <div className="integration-row brightspace-row"><div><strong>{brightspaceStatus?.connected ? t('connected') : t('notConnected')}</strong><span>{t('lastSync')}: {lastSync}</span></div><span className={`status-pill ${brightspaceStatus?.connected ? 'available' : ''}`}>{brightspaceStatus?.connected ? t('ready') : t('loginRequired')}</span></div>
        {message && <div className="integration-message success"><Link2 size={15}/><span>{message}</span></div>}
        {integrationError && <div className="integration-message error"><span>{integrationError}</span></div>}
        <div className="integration-actions">
          <button className="button primary" disabled={Boolean(busy)} onClick={() => void connect()}>{busy === 'connect' ? <Loader2 className="spin" size={15}/> : <Link2 size={15}/>} {t('connectRelogin')}</button>
          <button className="button secondary" disabled={Boolean(busy) || !brightspaceStatus?.connected} onClick={() => void sync()}>{busy === 'sync' ? <Loader2 className="spin" size={15}/> : <RefreshCw size={15}/>} {t('syncNow')}</button>
          <button className="button secondary" disabled={!logPath} onClick={() => { if (logPath) void window.dailyRoutine.openPath(logPath) }}><FileText size={15}/>{t('openLog')}</button>
          <button className="button ghost danger" disabled={Boolean(busy) || !brightspaceStatus?.connected} onClick={() => void disconnect()}><Unplug size={15}/>{t('disconnect')}</button>
        </div>
        <p className="daily-refresh-note"><RefreshCw size={12}/>{t('dailyBrightspace')}</p>
        <p className="privacy-note">{language === 'zh' ? 'Brightspace API 返回的准确日期会直接进入截止日期；粘贴邮件产生的识别结果仍需在收件箱中确认。日志不会记录 Cookie、令牌、密码或 MFA 答案。' : 'Exact dates from the Brightspace API go directly to Deadlines; pasted email interpretations still go to Inbox for review. Logs contain course IDs, names, request outcomes, and timestamps—but never cookies, CSRF tokens, bearer tokens, passwords, or MFA answers.'}</p>
        {logPath && <div className="log-path"><span>{t('diagnosticLog')}</span><code>{logPath}</code></div>}
      </div></section>
      <section className="settings-section"><div className="settings-icon"><GraduationCap size={20}/></div><div className="settings-content"><h2>Gradescope</h2><p>{t('gradescopeHint')}</p>
        <div className="integration-row brightspace-row"><div><strong>{gradescopeStatus?.connected ? t('connected') : t('notConnected')}</strong><span>{t('lastSync')}: {gradescopeLastSync}</span></div><span className={`status-pill ${gradescopeStatus?.connected ? 'available' : ''}`}>{gradescopeStatus?.connected ? t('ready') : t('loginRequired')}</span></div>
        <div className="auto-login-row"><div><KeyRound size={16}/><span><strong>{t('autoLogin')}</strong><small>{autoLoginStatus?.enabled ? `${t('encryptedAccount')}: ${autoLoginStatus.emailHint}` : t('autoLoginHint')}</small></span></div><label className="switch-label"><input type="checkbox" checked={Boolean(autoLoginStatus?.enabled)} disabled={Boolean(autoLoginStatus && !autoLoginStatus.encryptionAvailable)} onChange={(event) => { if (event.target.checked) { setCredentialError(undefined); setShowCredentials(true) } else void disableAutoLogin() }}/><span className="switch"/></label></div>
        {autoLoginStatus && !autoLoginStatus.encryptionAvailable && <div className="integration-message error"><span>{t('encryptionUnavailable')}</span></div>}
        {gradescopeMessage && <div className="integration-message success"><Link2 size={15}/><span>{gradescopeMessage}</span></div>}
        {gradescopeError && <div className="integration-message error"><span>{gradescopeError}</span></div>}
        <div className="integration-actions">
          <button className="button primary" disabled={Boolean(gradescopeBusy)} onClick={() => void connectGradescope()}>{gradescopeBusy === 'connect' ? <Loader2 className="spin" size={15}/> : <Link2 size={15}/>} {t('loginRelogin')}</button>
          <button className="button secondary" disabled={Boolean(gradescopeBusy) || (!gradescopeStatus?.connected && !autoLoginStatus?.enabled)} onClick={() => void syncGradescope()}>{gradescopeBusy === 'sync' ? <Loader2 className="spin" size={15}/> : <RefreshCw size={15}/>} {t('syncNow')}</button>
          <button className="button secondary" disabled={!gradescopeLogPath} onClick={() => { if (gradescopeLogPath) void window.dailyRoutine.openPath(gradescopeLogPath) }}><FileText size={15}/>{t('openLog')}</button>
          <button className="button ghost danger" disabled={Boolean(gradescopeBusy) || !gradescopeStatus?.connected} onClick={() => void disconnectGradescope()}><Unplug size={15}/>{t('disconnect')}</button>
        </div>
        <p className="daily-refresh-note"><RefreshCw size={12}/>{t('dailyGradescope')}</p>
        <p className="privacy-note">{language === 'zh' ? 'Gradescope 没有公开的学生 REST API，因此该连接器通过本机已登录的浏览器会话读取课程面板；凭据和会话 Cookie 不会写入日志。' : 'Gradescope does not provide a generally available student REST API, so this connector reads the course dashboard through your local authenticated browser session. Credentials and session cookies are never written to logs.'}</p>
        {gradescopeLogPath && <div className="log-path"><span>{t('diagnosticLog')}</span><code>{gradescopeLogPath}</code></div>}
      </div></section>
      <section className="settings-section"><div className="settings-icon"><Mail size={20}/></div><div className="settings-content"><h2>{t('emailImport')}</h2><div className="integration-row"><div><strong>{t('email')}</strong><span>{t('emailImportHint')}</span></div><span className="status-pill available">{t('available')}</span></div></div></section>
      <section className="settings-section"><div className="settings-icon"><Database size={20}/></div><div className="settings-content"><h2>{t('localData')}</h2><p>{t('localDataHint')}</p><div className="data-path"><span>{t('sqliteDatabase')}</span><code>{dataPath}</code></div><div className="integration-row"><div><strong>{t('demoData')}</strong><span>{courses.length} {t('coursesLoaded')}</span></div><button className="button secondary" onClick={() => { if (confirm(language === 'zh' ? '将所有当前数据替换为初始演示数据？此操作无法撤销。' : 'Replace all current data with the original demo data? This cannot be undone.')) onReset() }}><RotateCcw size={15}/>{t('resetDemo')}</button></div></div></section>
    </div>
    {showCredentials && <Modal title={t('configureAutoLogin')} onClose={() => { if (!credentialBusy) { setShowCredentials(false); setCredentialPassword(''); setCredentialError(undefined) } }}>
      <form onSubmit={(event) => { event.preventDefault(); void saveAutoLogin() }}>
        <p className="credential-explainer">{language === 'zh' ? '账号和密码会由操作系统安全存储（macOS 钥匙串或 Windows DPAPI）加密后保存在本机，不会写入数据库或日志。保存前会先尝试登录以确认凭据有效。' : 'Your credentials are encrypted by the operating system (macOS Keychain or Windows DPAPI). They are never stored in the database or logs, and will be verified before saving.'}</p>
        <label>{t('gradescopeEmail')}<input type="email" autoComplete="username" required autoFocus value={credentialEmail} onChange={(event) => setCredentialEmail(event.target.value)} placeholder="name@example.edu"/></label>
        <label>{t('gradescopePassword')}<input type="password" autoComplete="current-password" required value={credentialPassword} onChange={(event) => setCredentialPassword(event.target.value)}/></label>
        {credentialError && <div className="integration-message error"><span>{credentialError}</span></div>}
        <div className="modal-actions"><span/><div><button type="button" className="button secondary" disabled={credentialBusy} onClick={() => { setShowCredentials(false); setCredentialPassword(''); setCredentialError(undefined) }}>{t('cancel')}</button><button className="button primary" disabled={credentialBusy}>{credentialBusy && <Loader2 className="spin" size={15}/>} {t('saveAndLogin')}</button></div></div>
      </form>
    </Modal>}
  </div>
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
