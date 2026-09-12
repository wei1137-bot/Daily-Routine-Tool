import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow, session, type Session } from 'electron'
import { DateTime } from 'luxon'
import { academicCourseCode, normalizeCourseCode, normalizedCourseName } from './course-code'
import { CredentialStore, type GradescopeCredentials } from './credential-store'
import { configureAuthenticationPopups, persistentSessionWebPreferences } from './authentication-window'

const BASE_URL = 'https://www.gradescope.com'
export const GRADESCOPE_SESSION_PARTITION = 'persist:gradescope'

export interface GradescopeCoursePayload {
  id: number
  shortName: string
  fullName: string
  term: string
}

export interface GradescopeItemPayload {
  id: string
  courseId: number
  title: string
  dueDate: string | null
  lateDueDate: string | null
  submitted: boolean
  url: string
}

export interface GradescopePayload {
  baseUrl: string
  courses: GradescopeCoursePayload[]
  items: GradescopeItemPayload[]
  warnings: string[]
  stats: { coursesFound: number; currentCourses: number; skippedTerms: number }
}

export interface GradescopeStatus {
  connected: boolean
  message: string
}

class GradescopeAuthRequiredError extends Error {
  constructor(message = 'Gradescope 登录已过期，请在设置中重新登录。') {
    super(message)
    this.name = 'GradescopeAuthRequiredError'
  }
}

export class GradescopeService {
  private loginWindow: BrowserWindow | null = null

  constructor(readonly logPath: string, readonly credentialStore: CredentialStore) {
    this.writeLog('INFO', 'Gradescope connector initialized')
  }

  private browserSession(): Session {
    return session.fromPartition(GRADESCOPE_SESSION_PARTITION)
  }

  async getStatus(): Promise<GradescopeStatus> {
    try {
      const response = await this.browserSession().fetch(`${BASE_URL}/account`)
      const html = await response.text()
      const connected = response.url.includes('/account') && /id=["']account-show["']/.test(html)
      return { connected, message: connected ? '已保存 Gradescope 登录会话' : '尚未登录 Gradescope' }
    } catch {
      return { connected: false, message: '无法检查 Gradescope 会话' }
    }
  }

  async connect(): Promise<GradescopeStatus> {
    if (this.loginWindow && !this.loginWindow.isDestroyed()) {
      this.loginWindow.show()
      this.loginWindow.focus()
      throw new Error('Gradescope 登录窗口已经打开。')
    }
    this.writeLog('INFO', 'Interactive login started')
    const win = this.createWindow(true)
    this.loginWindow = win
    await new Promise<void>((resolve, reject) => {
      let finished = false
      const finish = (error?: Error) => {
        if (finished) return
        finished = true
        clearInterval(poll)
        clearTimeout(timeout)
        this.loginWindow = null
        if (!win.isDestroyed()) win.close()
        if (error) reject(error)
        else resolve()
      }
      const check = async () => {
        if (win.isDestroyed() || win.webContents.isDestroyed()) return
        const authenticated = await win.webContents.executeJavaScript(
          `location.pathname === '/account' && Boolean(document.querySelector('#account-show'))`, true
        ).catch(() => false)
        if (authenticated) finish()
      }
      const poll = setInterval(() => { void check() }, 750)
      const timeout = setTimeout(() => finish(new GradescopeAuthRequiredError('Gradescope 登录等待超时，请重试。')), 10 * 60_000)
      win.on('closed', () => {
        if (!finished) finish(new GradescopeAuthRequiredError('Gradescope 登录窗口已关闭，未完成登录。'))
      })
      win.webContents.on('did-finish-load', () => { void check() })
      void win.loadURL(`${BASE_URL}/login`).catch((error) => finish(new Error(`无法打开 Gradescope：${errorMessage(error)}`)))
      win.show()
      win.focus()
    })
    await this.browserSession().flushStorageData()
    this.writeLog('INFO', 'Interactive login completed')
    return this.getStatus()
  }

  getAutoLoginStatus() {
    return this.credentialStore.status()
  }

  async configureAutoLogin(credentials: GradescopeCredentials) {
    this.credentialStore.save(credentials)
    const win = this.createWindow(false)
    try {
      await this.ensureAuthenticated(win, true)
      await this.browserSession().flushStorageData()
      this.writeLog('INFO', 'Automatic login configured and verified', { account: this.credentialStore.status().emailHint })
      return this.credentialStore.status()
    } catch (error) {
      this.credentialStore.clear()
      this.writeLog('WARN', 'Automatic login verification failed', { error: safeLoginError(error) })
      throw new GradescopeAuthRequiredError('Gradescope 自动登录失败，请检查邮箱和密码后重试。')
    } finally {
      if (!win.isDestroyed()) win.close()
    }
  }

  disableAutoLogin() {
    this.credentialStore.clear()
    this.writeLog('INFO', 'Automatic login disabled and encrypted credentials removed')
    return this.credentialStore.status()
  }

  async disconnect(): Promise<GradescopeStatus> {
    if (this.loginWindow && !this.loginWindow.isDestroyed()) this.loginWindow.close()
    await this.browserSession().clearStorageData()
    await this.browserSession().clearCache()
    this.writeLog('INFO', 'Gradescope browser session disconnected')
    return this.getStatus()
  }

  async sync(timezone: string, existingCourses: Array<{ code: string; name: string }> = []): Promise<GradescopePayload> {
    this.writeLog('INFO', 'Sync started')
    const win = this.createWindow(false)
    try {
      await this.ensureAuthenticated(win, true)

      const allCourses = await win.webContents.executeJavaScript(`(() => {
        const result = []
        for (const termElement of document.querySelectorAll('.courseList--term')) {
          const term = (termElement.textContent || '').trim()
          let container = termElement.nextElementSibling
          while (container && !container.classList.contains('courseList--coursesForTerm')) {
            if (container.classList.contains('courseList--term')) break
            container = container.nextElementSibling
          }
          if (!container?.classList.contains('courseList--coursesForTerm')) continue
          for (const course of container.querySelectorAll('a.courseBox[href*="/courses/"]')) {
            const match = course.getAttribute('href')?.match(/\\/courses\\/(\\d+)/)
            if (!match) continue
            result.push({
              id: Number(match[1]), term,
              shortName: (course.querySelector('.courseBox--shortname')?.textContent || '').trim(),
              fullName: (course.querySelector('.courseBox--name')?.textContent || '').trim()
            })
          }
        }
        return result
      })()`, true) as GradescopeCoursePayload[]

      const uniqueCourses = [...new Map(allCourses.map((course) => [course.id, course])).values()]
      const academicCourses = uniqueCourses.filter((course) => Boolean(academicCourseCode(course.shortName, course.fullName)))
      const existingCodes = new Set(existingCourses.map((course) => normalizeCourseCode(course.code)))
      const existingNames = new Set(existingCourses.flatMap((course) => [
        normalizedCourseName(course.code), normalizedCourseName(course.name)
      ]))
      const courses = academicCourses.filter((course) => {
        const code = academicCourseCode(course.shortName, course.fullName)
        const matchesExisting = Boolean(code && existingCodes.has(normalizeCourseCode(code))) || [course.shortName, course.fullName]
          .some((value) => existingNames.has(normalizedCourseName(value)))
        return matchesExisting || isCurrentTerm(course.term, new Date())
      })
      const warnings: string[] = []
      const items: GradescopeItemPayload[] = []
      for (const course of courses) {
        try {
          await win.loadURL(`${BASE_URL}/courses/${course.id}`)
          if (win.webContents.getURL().includes('/login')) throw new GradescopeAuthRequiredError()
          const rows = await win.webContents.executeJavaScript(`(() => {
            return [...document.querySelectorAll('#assignments-student-table tbody tr')].map((row, index) => {
              const titleCell = row.querySelector('th.table--primaryLink')
              if (!titleCell) return null
              const button = titleCell.querySelector('button')
              const link = titleCell.querySelector('a[href*="/assignments/"]')
              const href = button?.dataset.postUrl || link?.getAttribute('href') || ''
              const assignmentId = button?.dataset.assignmentId || String(href).match(/\\/assignments\\/(\\d+)/)?.[1]
              const dueTimes = [...row.querySelectorAll('time.submissionTimeChart--dueDate')]
              const status = row.querySelector('td.submissionStatus')
              const title = (button?.textContent || link?.textContent || titleCell.textContent || '').trim()
              const titleKey = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
              return {
                id: assignmentId || (titleKey ? 'title-' + titleKey : 'row-' + index),
                title,
                href,
                submitted: Boolean(status?.classList.contains('submissionStatus-complete')),
                dueDate: dueTimes[0]?.getAttribute('datetime') || null,
                lateDueDate: dueTimes[1]?.getAttribute('datetime') || null
              }
            }).filter(Boolean)
          })()`, true) as Array<{ id: string; title: string; href: string; submitted: boolean; dueDate: string | null; lateDueDate: string | null }>
          for (const row of rows) {
            items.push({
              id: row.id,
              courseId: course.id,
              title: row.title,
              submitted: row.submitted,
              dueDate: parseDate(row.dueDate, timezone),
              lateDueDate: parseDate(row.lateDueDate, timezone),
              url: new URL(row.href || `/courses/${course.id}`, BASE_URL).toString()
            })
          }
          this.writeLog('INFO', 'Course read successfully', {
            courseId: course.id, course: course.shortName || course.fullName, assignments: rows.length
          })
        } catch (error) {
          if (error instanceof GradescopeAuthRequiredError) throw error
          const message = `${course.shortName || course.fullName}：读取失败（${errorMessage(error)}）`
          warnings.push(message)
          this.writeLog('WARN', 'Course read failed', { courseId: course.id, error: errorMessage(error) })
        }
      }
      const payload = {
        baseUrl: BASE_URL,
        courses,
        items,
        warnings,
        stats: { coursesFound: uniqueCourses.length, currentCourses: courses.length, skippedTerms: uniqueCourses.length - courses.length }
      }
      this.writeLog('INFO', 'Sync completed', {
        ...payload.stats, assignments: items.length, warnings: warnings.length
      })
      return payload
    } catch (error) {
      this.writeLog('ERROR', 'Sync failed', { error: errorMessage(error) })
      throw error
    } finally {
      if (!win.isDestroyed()) win.close()
    }
  }

  recordImportSummary(summary: Record<string, unknown>) {
    this.writeLog('INFO', 'Database import completed', summary)
  }

  private createWindow(visible: boolean) {
    const win = new BrowserWindow({
      width: 1000,
      height: 760,
      minWidth: 720,
      minHeight: 560,
      show: visible,
      title: '登录 Gradescope — Daily Routine',
      autoHideMenuBar: true,
      webPreferences: persistentSessionWebPreferences(GRADESCOPE_SESSION_PARTITION)
    })
    configureAuthenticationPopups(win, GRADESCOPE_SESSION_PARTITION)
    return win
  }

  private async ensureAuthenticated(win: BrowserWindow, allowAutomaticLogin: boolean) {
    await win.loadURL(`${BASE_URL}/account`)
    if (await this.isAuthenticated(win)) return
    const credentials = allowAutomaticLogin ? this.credentialStore.load() : null
    if (!credentials) throw new GradescopeAuthRequiredError()

    this.writeLog('INFO', 'Saved Gradescope session expired; attempting automatic login', {
      account: this.credentialStore.status().emailHint
    })
    await win.loadURL(`${BASE_URL}/login`)
    const submitted = await win.webContents.executeJavaScript(`(() => {
      const email = document.querySelector('input[type="email"], input[name*="email" i], #session_email')
      const password = document.querySelector('input[type="password"], input[name*="password" i], #session_password')
      if (!(email instanceof HTMLInputElement) || !(password instanceof HTMLInputElement)) return false
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setValue.call(email, ${JSON.stringify(credentials.email)})
      setValue.call(password, ${JSON.stringify(credentials.password)})
      for (const input of [email, password]) {
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }
      const remember = document.querySelector('input[type="checkbox"][name*="remember" i]')
      if (remember instanceof HTMLInputElement && !remember.checked) remember.click()
      const form = password.form || email.form || document.querySelector('form[action*="login"]')
      if (!(form instanceof HTMLFormElement)) return false
      if (typeof form.requestSubmit === 'function') form.requestSubmit()
      else form.submit()
      return true
    })()`, true).catch(() => false)
    if (!submitted) throw new GradescopeAuthRequiredError('找不到 Gradescope 登录表单。')

    const deadline = Date.now() + 25_000
    while (Date.now() < deadline) {
      if (await this.isAuthenticated(win)) {
        await this.browserSession().flushStorageData()
        this.writeLog('INFO', 'Automatic login completed')
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw new GradescopeAuthRequiredError('Gradescope 自动登录未成功。')
  }

  private async isAuthenticated(win: BrowserWindow) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return false
    return win.webContents.executeJavaScript(
      `location.pathname === '/account' && Boolean(document.querySelector('#account-show'))`, true
    ).catch(() => false) as Promise<boolean>
  }

  private writeLog(level: 'INFO' | 'WARN' | 'ERROR', message: string, details?: Record<string, unknown>) {
    try {
      fs.mkdirSync(path.dirname(this.logPath), { recursive: true })
      if (fs.existsSync(this.logPath) && fs.statSync(this.logPath).size > 1024 * 1024) {
        const previous = `${this.logPath}.1`
        if (fs.existsSync(previous)) fs.unlinkSync(previous)
        fs.renameSync(this.logPath, previous)
      }
      const suffix = details ? ` ${JSON.stringify(details)}` : ''
      fs.appendFileSync(this.logPath, `${new Date().toISOString()} [${level}] ${message}${suffix}\n`, 'utf8')
    } catch {
      // Logging must never make a Gradescope operation fail.
    }
  }
}

function parseDate(value: string | null, timezone: string) {
  if (!value) return null
  let parsed = DateTime.fromISO(value, { setZone: true })
  if (!parsed.isValid) parsed = DateTime.fromSQL(value, { zone: timezone })
  if (!parsed.isValid) return null
  if (!/[zZ]|[+-]\d\d(?::?\d\d)?$/.test(value)) parsed = parsed.setZone(timezone, { keepLocalTime: true })
  return parsed.toUTC().toISO()
}

export function isCurrentTerm(term: string, now: Date) {
  const match = term.match(/\b(Spring|Summer|Fall|Winter)\s+(20\d{2})\b/i)
  if (!match) return true
  const year = Number(match[2])
  const season = match[1].toLowerCase()
  const at = now.getTime()
  if (season === 'spring') return at >= Date.UTC(year, 0, 1) && at <= Date.UTC(year, 5, 1)
  if (season === 'summer') return at >= Date.UTC(year, 4, 1) && at <= Date.UTC(year, 7, 20)
  if (season === 'fall') return at >= Date.UTC(year, 7, 1) && at <= Date.UTC(year + 1, 0, 15)
  return at >= Date.UTC(year, 11, 1) && at <= Date.UTC(year + 1, 2, 1)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function safeLoginError(error: unknown) {
  if (error instanceof GradescopeAuthRequiredError) return error.message
  return error instanceof Error ? error.name : 'Unknown error'
}
