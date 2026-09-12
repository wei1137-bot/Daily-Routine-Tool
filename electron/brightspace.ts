import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow, session, type Session } from 'electron'
import { extractPdfText, parseSyllabus, type ParsedSyllabus } from './syllabus-parser'
import { academicCourseCode } from './course-code'

const PARTITION = 'persist:brightspace'
const LP_VERSION = '1.62'
const LE_VERSION = '1.96'
const EXPIRED_MARKER = 'sessionExpired=1'

export interface BrightspaceCoursePayload {
  id: number
  name: string
  code: string
  isActive: boolean
  startDate: string | null
  endDate: string | null
}

export interface BrightspaceItemPayload {
  id: number
  courseId: number
  title: string
  kind: 'assignment' | 'quiz' | 'lab' | 'discussion' | 'reading' | 'lecture' | 'other'
  dueDate: string | null
  url: string
  externalId?: string
}

export interface BrightspacePayload {
  baseUrl: string
  courses: BrightspaceCoursePayload[]
  items: BrightspaceItemPayload[]
  syllabi: ParsedSyllabus[]
  warnings: string[]
  excludedCourseIds: number[]
  stats: {
    enrolledCourses: number
    currentCourses: number
    skippedByAccessWindow: number
    skippedNonAcademic: number
    inaccessibleCourses: number
    syllabiFound: number
  }
}

export interface BrightspaceStatus {
  connected: boolean
  baseUrl: string
  message: string
}

class BrightspaceAuthRequiredError extends Error {
  constructor(message = 'Brightspace 登录已过期，请重新连接。') {
    super(message)
    this.name = 'BrightspaceAuthRequiredError'
  }
}

export class BrightspaceService {
  private loginWindow: BrowserWindow | null = null

  constructor(readonly logPath: string, private readonly syllabusDirectory: string) {
    this.writeLog('INFO', 'Brightspace connector initialized')
  }

  private browserSession(): Session {
    return session.fromPartition(PARTITION)
  }

  normalizeBaseUrl(value: string) {
    const candidate = value.trim() || 'https://purdue.brightspace.com'
    let parsed: URL
    try {
      parsed = new URL(candidate)
    } catch {
      throw new Error('请输入有效的 Brightspace 地址，例如 https://purdue.brightspace.com')
    }
    if (parsed.protocol !== 'https:') throw new Error('Brightspace 地址必须使用 HTTPS。')
    return parsed.origin
  }

  async getStatus(value: string): Promise<BrightspaceStatus> {
    const baseUrl = this.normalizeBaseUrl(value)
    const cookies = await this.browserSession().cookies.get({ url: baseUrl })
    const connected = cookies.some((cookie) => cookie.name === 'd2lSessionVal' && Boolean(cookie.value))
    return {
      connected,
      baseUrl,
      message: connected ? '已保存 Brightspace 登录会话' : '尚未登录 Brightspace'
    }
  }

  async connect(value: string): Promise<BrightspaceStatus> {
    const baseUrl = this.normalizeBaseUrl(value)
    this.writeLog('INFO', 'Interactive login started', { baseUrl })
    await this.captureAuthenticatedContext(baseUrl, true, 10 * 60_000)
    await this.browserSession().flushStorageData()
    this.writeLog('INFO', 'Interactive login completed', { baseUrl })
    return this.getStatus(baseUrl)
  }

  async disconnect(value: string): Promise<BrightspaceStatus> {
    const baseUrl = this.normalizeBaseUrl(value)
    if (this.loginWindow && !this.loginWindow.isDestroyed()) this.loginWindow.close()
    await this.browserSession().clearStorageData()
    await this.browserSession().clearCache()
    this.writeLog('INFO', 'Brightspace browser session disconnected', { baseUrl })
    return this.getStatus(baseUrl)
  }

  async sync(value: string, timezone: string): Promise<BrightspacePayload> {
    const baseUrl = this.normalizeBaseUrl(value)
    this.writeLog('INFO', 'Sync started', { baseUrl })
    try {
      const { csrfToken } = await this.captureAuthenticatedContext(baseUrl, false, 30_000)
      const browserSession = this.browserSession()
      const token = await this.mintToken(browserSession, baseUrl, csrfToken)
      const enrolledCourses = await this.fetchCourses(browserSession, baseUrl, token)
      const academicCourses = enrolledCourses.filter((course) => Boolean(academicCourseCode(course.code, course.name)))
      const nonAcademicCourses = enrolledCourses.filter((course) => !academicCourseCode(course.code, course.name))
      const { current, skipped } = currentCourses(academicCourses, new Date())
      const warnings: string[] = []
      const accessibleCourses: BrightspaceCoursePayload[] = []
      const groups: BrightspaceItemPayload[][] = []
      const syllabi: ParsedSyllabus[] = []
      let inaccessibleCourses = 0
      const inaccessibleCourseIds: number[] = []

      for (const entry of skipped) {
        this.writeLog('INFO', 'Course skipped by access window', {
          courseId: entry.course.id, course: entry.course.name, reason: entry.reason,
          startDate: entry.course.startDate, endDate: entry.course.endDate
        })
      }
      for (const course of nonAcademicCourses) {
        this.writeLog('INFO', 'Course skipped because it has no academic course code', {
          courseId: course.id, course: course.name, code: course.code
        })
      }

      await Promise.all(current.map(async (course) => {
        const [assignments, quizzes, calendarEvents] = await Promise.allSettled([
          this.fetchAssignments(browserSession, baseUrl, token, course.id),
          this.fetchQuizzes(browserSession, baseUrl, token, course.id),
          this.fetchCalendarEvents(browserSession, baseUrl, token, course.id)
        ])
        const assignmentError = assignments.status === 'rejected' ? errorMessage(assignments.reason) : null
        const quizError = quizzes.status === 'rejected' ? errorMessage(quizzes.reason) : null
        const calendarError = calendarEvents.status === 'rejected' ? errorMessage(calendarEvents.reason) : null
        if (assignmentError && quizError && calendarError) {
          inaccessibleCourses++
          inaccessibleCourseIds.push(course.id)
          this.writeLog('WARN', 'Course excluded because all content routes failed', {
            courseId: course.id, course: course.name, assignments: assignmentError,
            quizzes: quizError, calendar: calendarError
          })
          return
        }
        const items = [
          ...(assignments.status === 'fulfilled' ? assignments.value : []),
          ...(quizzes.status === 'fulfilled' ? quizzes.value : []),
          ...(calendarEvents.status === 'fulfilled' ? calendarEvents.value : [])
        ]
        accessibleCourses.push(course)
        groups.push(items)
        try {
          const syllabus = await this.fetchSyllabus(browserSession, baseUrl, token, course, timezone)
          if (syllabus) {
            syllabi.push(syllabus)
            this.writeLog('INFO', 'Syllabus read successfully', {
              courseId: course.id, course: course.name, file: syllabus.fileName,
              characters: syllabus.rawText.length, gradingItems: syllabus.gradingItems.length,
              examEvents: syllabus.events.length
            })
          } else {
            this.writeLog('INFO', 'No syllabus candidate found', { courseId: course.id, course: course.name })
          }
        } catch (error) {
          warnings.push(`${course.name}：syllabus 读取失败（${errorMessage(error)}）`)
          this.writeLog('WARN', 'Syllabus read failed', { courseId: course.id, course: course.name, error: errorMessage(error) })
        }
        if (assignmentError || quizError || calendarError) {
          const detail = [
            assignmentError ? `作业读取失败（${assignmentError}）` : null,
            quizError ? `测验读取失败（${quizError}）` : null,
            calendarError ? `日历读取失败（${calendarError}）` : null
          ].filter(Boolean).join('；')
          warnings.push(`${course.name}：${detail}`)
          this.writeLog('WARN', 'Course partially readable', {
            courseId: course.id, course: course.name, assignments: assignmentError ?? 'ok',
            quizzes: quizError ?? 'ok', calendar: calendarError ?? 'ok', items: items.length
          })
        } else {
          this.writeLog('INFO', 'Course read successfully', {
            courseId: course.id, course: course.name, items: items.length,
            assignments: assignments.status === 'fulfilled' ? assignments.value.length : 0,
            quizzes: quizzes.status === 'fulfilled' ? quizzes.value.length : 0,
            calendar: calendarEvents.status === 'fulfilled' ? calendarEvents.value.length : 0
          })
        }
      }))

      const stats = {
        enrolledCourses: enrolledCourses.length,
        currentCourses: current.length,
        skippedByAccessWindow: skipped.length,
        skippedNonAcademic: nonAcademicCourses.length,
        inaccessibleCourses,
        syllabiFound: syllabi.length
      }
      this.writeLog('INFO', 'Sync completed', {
        ...stats, importedCourses: accessibleCourses.length, items: groups.flat().length, partialWarnings: warnings.length
      })
      return {
        baseUrl, courses: accessibleCourses, items: groups.flat(), syllabi, warnings, stats,
        excludedCourseIds: [
          ...skipped.map((entry) => entry.course.id),
          ...nonAcademicCourses.map((course) => course.id),
          ...inaccessibleCourseIds
        ]
      }
    } catch (error) {
      this.writeLog('ERROR', 'Sync failed', { error: errorMessage(error) })
      throw error
    }
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
      // Logging must never make a Brightspace operation fail.
    }
  }

  recordImportSummary(summary: Record<string, unknown>) {
    this.writeLog('INFO', 'Database import completed', summary)
  }

  private async captureAuthenticatedContext(baseUrl: string, visible: boolean, timeoutMs: number) {
    if (visible && this.loginWindow && !this.loginWindow.isDestroyed()) {
      this.loginWindow.show()
      this.loginWindow.focus()
      throw new Error('Brightspace 登录窗口已经打开。')
    }

    const win = new BrowserWindow({
      width: 1080,
      height: 760,
      minWidth: 760,
      minHeight: 560,
      show: visible,
      title: '登录 Brightspace — Daily Routine',
      autoHideMenuBar: true,
      webPreferences: {
        partition: PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    if (visible) this.loginWindow = win

    const homeUrl = `${baseUrl}/d2l/home`
    const existingCookies = await this.browserSession().cookies.get({ url: baseUrl })
    const hasD2lSession = existingCookies.some((cookie) => cookie.name === 'd2lSessionVal' && Boolean(cookie.value))
    const hostname = new URL(baseUrl).hostname.toLowerCase()
    const navigationUrl = !hasD2lSession && hostname === 'purdue.brightspace.com'
      ? `${baseUrl}/d2l/lp/auth/saml/initiate-login?entityId=${encodeURIComponent('https://idp.purdue.edu/idp/shibboleth')}&target=${encodeURIComponent('/d2l/home')}`
      : homeUrl
    this.writeLog('INFO', 'Authentication capture started', {
      visible,
      route: navigationUrl === homeUrl ? 'Brightspace home' : 'Purdue SAML'
    })

    let failCapture: ((error: Error) => void) | null = null
    const result = new Promise<{ csrfToken: string | null }>((resolve, reject) => {
      let finished = false
      const finish = (error?: Error, csrfToken: string | null = null) => {
        if (finished) return
        finished = true
        clearInterval(poll)
        clearTimeout(timeout)
        if (visible) this.loginWindow = null
        if (!win.isDestroyed()) win.close()
        if (error) reject(error)
        else resolve({ csrfToken })
      }
      failCapture = (error) => finish(error)

      const check = async () => {
        if (win.isDestroyed() || win.webContents.isDestroyed()) return
        try {
          const cookies = await this.browserSession().cookies.get({ url: baseUrl })
          if (!cookies.some((cookie) => cookie.name === 'd2lSessionVal' && Boolean(cookie.value))) {
            await this.clickThroughSafeLoginPrompts(win)
            return
          }
          const authenticated = await win.webContents.executeJavaScript(
            'typeof window.D2L !== "undefined" && Boolean(window.D2L.LP)', true
          ).catch(() => false)
          if (!authenticated) {
            await this.clickThroughSafeLoginPrompts(win)
            return
          }
          const csrfToken = await win.webContents.executeJavaScript(`(() => {
            try {
              const token = window.D2L?.LP?.Web?.Authentication?.Xsrf?.GetXsrfToken?.()
              if (token) return token
            } catch (_) {}
            return document.querySelector('meta[name="d2l-xsrf-token"]')?.getAttribute('content') ?? null
          })()`, true).catch(() => null) as string | null
          finish(undefined, csrfToken)
        } catch {
          // Navigation can invalidate the page while the SSO chain is running.
        }
      }

      const poll = setInterval(() => { void check() }, 1000)
      const timeout = setTimeout(() => {
        let page = 'unknown'
        try {
          const current = new URL(win.webContents.getURL())
          page = `${current.origin}${current.pathname}`
        } catch {
          // Never log an unparsed authentication URL because its query may contain sensitive state.
        }
        this.writeLog('WARN', 'Authentication capture timed out', { visible, page })
        finish(new BrightspaceAuthRequiredError(
          visible ? '登录等待超时，请重新连接。' : 'Brightspace 会话已失效，请点击“连接 / 重新登录”。'
        ))
      }, timeoutMs)
      win.on('closed', () => {
        if (!finished) finish(new BrightspaceAuthRequiredError(visible ? '登录窗口已关闭，未完成连接。' : undefined))
      })
      win.webContents.on('did-finish-load', () => { void check() })
    })

    void win.loadURL(navigationUrl).catch((error) => {
      // SSO redirects can abort an in-flight navigation even though the next page is loading normally.
      if (!String(error).includes('ERR_ABORTED')) {
        failCapture?.(new Error(`无法打开 Brightspace：${errorMessage(error)}`))
      }
    })
    if (visible && !win.isDestroyed()) {
      win.show()
      win.focus()
    }
    return result
  }

  private async clickThroughSafeLoginPrompts(win: BrowserWindow) {
    const currentUrl = win.webContents.getURL()
    if (!currentUrl) return

    if (currentUrl.includes('/d2l/login')) {
      const clicked = await win.webContents.executeJavaScript(`(() => {
        const roots = [document]
        while (roots.length) {
          const root = roots.shift()
          const elements = [...root.querySelectorAll('*')]
          for (const element of elements) if (element.shadowRoot) roots.push(element.shadowRoot)
          const target = [...root.querySelectorAll('a, button, [role="button"]')]
            .find((element) => /purdue west lafayette/i.test(element.textContent || ''))
          if (!target || typeof target.click !== 'function') continue
          target.click()
          return true
        }
        return false
      })()`, true).catch(() => false)
      if (clicked) this.writeLog('INFO', 'Selected Purdue West Lafayette login provider')
      return
    }

    if (currentUrl.includes('login.microsoftonline.com')) {
      const clicked = await win.webContents.executeJavaScript(`(() => {
        const bodyText = document.body?.innerText || ''
        const isStaySignedIn = Boolean(document.querySelector('#KmsiCheckboxField')) || /stay signed in/i.test(bodyText)
        const button = document.querySelector('#idSIButton9')
        if (!isStaySignedIn || !button) return false
        button.click()
        return true
      })()`, true).catch(() => false)
      if (clicked) this.writeLog('INFO', 'Accepted Microsoft stay-signed-in prompt')
    }
  }

  private async mintToken(browserSession: Session, baseUrl: string, csrfToken: string | null) {
    const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' }
    if (csrfToken) headers['x-csrf-token'] = csrfToken
    const response = await browserSession.fetch(`${baseUrl}/d2l/lp/auth/oauth2/token`, {
      method: 'POST', headers, body: 'scope=*:*:*'
    })
    const body = await response.text()
    if (body.includes(EXPIRED_MARKER)) throw new BrightspaceAuthRequiredError()
    if (!response.ok) throw new Error(`Brightspace 令牌请求失败（HTTP ${response.status}）`)
    const token = parseJson(body)?.access_token
    if (typeof token !== 'string' || !token) throw new Error('Brightspace 未返回访问令牌。')
    return token
  }

  private async fetchCourses(browserSession: Session, baseUrl: string, token: string): Promise<BrightspaceCoursePayload[]> {
    const payload = await this.bearerJson(browserSession,
      `${baseUrl}/d2l/api/lp/${LP_VERSION}/enrollments/myenrollments/?orgUnitTypeId=3&isActive=true`, token)
    if (!Array.isArray(payload?.Items)) throw new Error('Brightspace 课程数据格式无法识别。')
    return payload.Items.flatMap((item: any): BrightspaceCoursePayload[] => {
      const org = item?.OrgUnit
      const access = item?.Access
      if (typeof org?.Id !== 'number' || typeof org?.Name !== 'string' || typeof org?.Code !== 'string') return []
      return [{ id: org.Id, name: org.Name, code: org.Code, isActive: access?.IsActive !== false,
        startDate: typeof access?.StartDate === 'string' ? access.StartDate : null,
        endDate: typeof access?.EndDate === 'string' ? access.EndDate : null }]
    })
  }

  private async fetchAssignments(browserSession: Session, baseUrl: string, token: string, courseId: number): Promise<BrightspaceItemPayload[]> {
    const payload = await this.bearerJson(browserSession,
      `${baseUrl}/d2l/api/le/${LE_VERSION}/${courseId}/dropbox/folders/`, token)
    if (!Array.isArray(payload)) throw new Error('返回值不是作业列表')
    return payload.flatMap((folder: any): BrightspaceItemPayload[] => {
      if (typeof folder?.Id !== 'number' || typeof folder?.Name !== 'string') return []
      return [{ id: folder.Id, courseId, title: folder.Name, kind: 'assignment',
        dueDate: validIso(folder.DueDate),
        url: `${baseUrl}/d2l/lms/dropbox/user/folder_submit_files.d2l?db=${folder.Id}&grpid=0&ou=${courseId}` }]
    })
  }

  private async fetchQuizzes(browserSession: Session, baseUrl: string, token: string, courseId: number): Promise<BrightspaceItemPayload[]> {
    const payload = await this.bearerJson(browserSession,
      `${baseUrl}/d2l/api/le/${LE_VERSION}/${courseId}/quizzes/`, token)
    if (!Array.isArray(payload?.Objects)) throw new Error('返回值不是测验列表')
    return payload.Objects.flatMap((quiz: any): BrightspaceItemPayload[] => {
      if (typeof quiz?.QuizId !== 'number' || typeof quiz?.Name !== 'string') return []
      return [{ id: quiz.QuizId, courseId, title: quiz.Name, kind: 'quiz',
        dueDate: validIso(quiz.DueDate),
        url: `${baseUrl}/d2l/lms/quizzing/user/quiz_summary.d2l?qi=${quiz.QuizId}&ou=${courseId}` }]
    })
  }

  private async fetchCalendarEvents(browserSession: Session, baseUrl: string, token: string, courseId: number): Promise<BrightspaceItemPayload[]> {
    const startDateTime = apiUtcDate(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000))
    const endDateTime = apiUtcDate(new Date(Date.now() + 370 * 24 * 60 * 60 * 1000))
    const query = new URLSearchParams({ association: '1', eventType: '6', startDateTime, endDateTime })
    const payload = await this.bearerJson(browserSession,
      `${baseUrl}/d2l/api/le/${LE_VERSION}/${courseId}/calendar/events/myEvents/?${query}`, token)
    const rows = Array.isArray(payload) ? payload
      : Array.isArray(payload?.Items) ? payload.Items
      : Array.isArray(payload?.Objects) ? payload.Objects
      : null
    if (!rows) throw new Error(`返回值不是日历事件列表（字段：${Object.keys(payload ?? {}).slice(0, 6).join(', ') || 'none'}）`)
    return rows.flatMap((event: any): BrightspaceItemPayload[] => {
      if (typeof event?.CalendarEventId !== 'number' || typeof event?.Title !== 'string') return []
      const dueDate = validIso(event.StartDateTime)
      if (!dueDate) return []
      const path = typeof event.CalendarEventViewUrl === 'string' ? event.CalendarEventViewUrl : ''
      return [{
        id: event.CalendarEventId,
        externalId: `calendar-${event.CalendarEventId}`,
        courseId,
        title: cleanCalendarTitle(event.Title),
        kind: calendarEventKind(event),
        dueDate,
        url: path ? new URL(path, baseUrl).toString() : `${baseUrl}/d2l/le/calendar/${courseId}`
      }]
    })
  }

  private async fetchSyllabus(browserSession: Session, baseUrl: string, token: string, course: BrightspaceCoursePayload, timezone: string) {
    let overviewText = ''
    let filePath: string | null = null
    let fileName: string | null = null
    let documentText = ''
    try {
      const overview = await this.bearerJson(browserSession, `${baseUrl}/d2l/api/le/${LE_VERSION}/${course.id}/overview`, token)
      overviewText = htmlToText(typeof overview?.Description?.Text === 'string' ? overview.Description.Text : '')
    } catch (error) {
      if (!isHttpStatus(error, 404)) throw error
    }

    try {
      const response = await browserSession.fetch(
        `${baseUrl}/d2l/api/le/${LE_VERSION}/${course.id}/overview/attachment`,
        { headers: { authorization: `Bearer ${token}` } }
      )
      if (response.status === 404) throw new BrightspaceHttpError(404)
      if (!response.ok) throw new BrightspaceHttpError(response.status)
      const data = Buffer.from(await response.arrayBuffer())
      const contentType = response.headers.get('content-type') ?? ''
      const fallback = `syllabus-overview-${course.id}${contentType.includes('pdf') ? '.pdf' : '.txt'}`
      const name = filenameFromDisposition(response.headers.get('content-disposition'), fallback)
      if (contentType.includes('pdf') || data.subarray(0, 4).toString('ascii') === '%PDF') {
        documentText = await extractPdfText(data)
      } else if (contentType.startsWith('text/') || /\.(txt|html?)$/i.test(name)) {
        documentText = contentType.includes('html') || /\.html?$/i.test(name)
          ? htmlToText(data.toString('utf8')) : data.toString('utf8')
      } else {
        throw new Error(`不支持的 overview attachment 类型（${contentType || 'unknown'}）`)
      }
      const directory = path.join(this.syllabusDirectory, String(course.id))
      fs.mkdirSync(directory, { recursive: true })
      fileName = name
      filePath = path.join(directory, name)
      fs.writeFileSync(filePath, data)
      this.writeLog('INFO', 'Syllabus overview attachment downloaded', {
        courseId: course.id, course: course.name, file: fileName, contentType, characters: documentText.length
      })
    } catch (error) {
      if (!isHttpStatus(error, 404)) {
        this.writeLog('WARN', 'Syllabus overview attachment could not be downloaded or parsed', {
          courseId: course.id, course: course.name, error: errorMessage(error)
        })
      }
    }

    if (documentText) {
      return parseSyllabus({ courseId: course.id, text: documentText, filePath, fileName, timezone, courseName: course.name })
    }

    const toc = await this.bearerJson(browserSession, `${baseUrl}/d2l/api/le/${LE_VERSION}/${course.id}/content/toc`, token)
    const topics = flattenToc(toc)
    const candidates = topics.filter((topic) =>
      /syllab/i.test(topic.title) || (/syllab/i.test(topic.module) && topic.type === 'File')
    )
    if (!overviewText && candidates.length === 0) {
      this.writeLog('INFO', 'Syllabus search inventory', {
        courseId: course.id,
        topics: topics.slice(0, 60).map((topic) => ({ title: topic.title, type: topic.type, module: topic.module }))
      })
    }
    for (const candidate of candidates.filter((topic) => topic.type === 'File')) {
      try {
        const response = await browserSession.fetch(
          `${baseUrl}/d2l/api/le/${LE_VERSION}/${course.id}/content/topics/${candidate.topicId}/file`,
          { headers: { authorization: `Bearer ${token}` } }
        )
        if (!response.ok) throw new BrightspaceHttpError(response.status)
        const data = Buffer.from(await response.arrayBuffer())
        const contentType = response.headers.get('content-type') ?? ''
        const fallback = `syllabus-${candidate.topicId}${contentType.includes('pdf') ? '.pdf' : '.txt'}`
        const name = filenameFromDisposition(response.headers.get('content-disposition'), fallback)
        if (contentType.includes('pdf') || data.subarray(0, 4).toString('ascii') === '%PDF') {
          documentText = await extractPdfText(data)
        } else if (contentType.startsWith('text/') || /\.(txt|html?)$/i.test(name)) {
          documentText = contentType.includes('html') || /\.html?$/i.test(name) ? htmlToText(data.toString('utf8')) : data.toString('utf8')
        } else {
          this.writeLog('WARN', 'Unsupported syllabus file type', {
            courseId: course.id, topicId: candidate.topicId, title: candidate.title, contentType
          })
          continue
        }
        const directory = path.join(this.syllabusDirectory, String(course.id))
        fs.mkdirSync(directory, { recursive: true })
        fileName = name
        filePath = path.join(directory, name)
        fs.writeFileSync(filePath, data)
        break
      } catch (error) {
        this.writeLog('WARN', 'Syllabus candidate could not be downloaded or parsed', {
          courseId: course.id, topicId: candidate.topicId, title: candidate.title, error: errorMessage(error)
        })
      }
    }
    const text = documentText || overviewText
    if (!text) return this.fetchPurdueSimpleSyllabus(baseUrl, course, timezone)
    return parseSyllabus({ courseId: course.id, text, filePath, fileName, timezone, courseName: course.name })
  }

  private async fetchPurdueSimpleSyllabus(baseUrl: string, course: BrightspaceCoursePayload, timezone: string) {
    if (new URL(baseUrl).hostname.toLowerCase() !== 'purdue.brightspace.com') return null
    const query = new URLSearchParams({
      ou: String(course.id),
      type: 'lti',
      rcode: '354644E0-4CD8-419D-A32F-4E78D8778E5C-12707056',
      srcou: '6824',
      launchFramed: '1',
      framedName: 'Syllabus'
    })
    const win = new BrowserWindow({
      width: 1100,
      height: 760,
      show: false,
      webPreferences: {
        partition: PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    try {
      await win.loadURL(`${baseUrl}/d2l/common/dialogs/quickLink/quickLink.d2l?${query}`)
      const deadline = Date.now() + 30_000
      let bestPage: { title: string; text: string } | null = null
      let firstReadableAt = 0
      let lastGrowthAt = 0
      while (Date.now() < deadline) {
        const frame = win.webContents.mainFrame.framesInSubtree.find((candidate) => {
          try {
            const url = new URL(candidate.url)
            return url.hostname.toLowerCase() === 'purdue.simplesyllabus.com' && /\/doc\//i.test(url.pathname)
          } catch {
            return false
          }
        })
        if (frame) {
          const page = await frame.executeJavaScript(`(() => ({
            title: document.title,
            text: document.body?.innerText || '',
            ready: document.readyState,
            loading: Boolean(document.querySelector('[aria-busy="true"], .loading, .spinner, [class*="skeleton"]')),
            scroll: (() => {
              window.scrollTo(0, document.documentElement?.scrollHeight || document.body?.scrollHeight || 0)
              for (const element of document.querySelectorAll('*')) {
                if (element.scrollHeight > element.clientHeight + 100) element.scrollTop = element.scrollHeight
              }
              return document.documentElement?.scrollHeight || document.body?.scrollHeight || 0
            })()
          }))()`, true).catch(() => null) as { title: string; text: string } | null
          if (page?.text && page.text.length > 500) {
            const observedAt = Date.now()
            if (!firstReadableAt) firstReadableAt = observedAt
            if (!bestPage || page.text.length > bestPage.text.length) {
              bestPage = { title: page.title, text: page.text }
              lastGrowthAt = observedAt
            }
            // Simple Syllabus fills long documents after the initial page load. Waiting for both
            // a minimum observation window and a stable text length prevents saving that shell.
            if (observedAt - firstReadableAt >= 8_000 && observedAt - lastGrowthAt >= 2_000) break
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      if (bestPage) {
        this.writeLog('INFO', 'Purdue Simple Syllabus read successfully', {
          courseId: course.id, course: course.name, title: bestPage.title,
          characters: bestPage.text.length, observedMs: Date.now() - firstReadableAt
        })
        return parseSyllabus({
          courseId: course.id,
          text: bestPage.text,
          filePath: null,
          fileName: null,
          timezone,
          courseName: course.name
        })
      }
      this.writeLog('INFO', 'No published Purdue Simple Syllabus found', { courseId: course.id, course: course.name })
      return null
    } catch (error) {
      this.writeLog('WARN', 'Purdue Simple Syllabus could not be opened', {
        courseId: course.id, course: course.name, error: errorMessage(error)
      })
      return null
    } finally {
      if (!win.isDestroyed()) win.destroy()
    }
  }

  private async bearerJson(browserSession: Session, url: string, token: string) {
    const response = await browserSession.fetch(url, { headers: { authorization: `Bearer ${token}` } })
    const body = await response.text()
    if (body.includes(EXPIRED_MARKER)) throw new BrightspaceAuthRequiredError()
    if (!response.ok) throw new BrightspaceHttpError(response.status)
    const payload = parseJson(body)
    if (payload === null) throw new Error('响应不是 JSON')
    return payload
  }
}

function parseJson(body: string): any {
  try { return JSON.parse(body) } catch { return null }
}

function validIso(value: unknown): string | null {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return null
  return new Date(value).toISOString()
}

function apiUtcDate(value: Date) {
  return value.toISOString().replace(/\.\d{3}Z$/, '.000Z')
}

function cleanCalendarTitle(value: string) {
  return value.trim().replace(/\s*[-–—:]\s*due\s*$/i, '').trim()
}

function calendarEventKind(event: any): BrightspaceItemPayload['kind'] {
  const entity = String(event?.AssociatedEntity?.EntityType ?? '')
  const title = String(event?.Title ?? '')
  if (/quizzing\.quiz/i.test(entity) || /\bquiz\b/i.test(title)) return 'quiz'
  if (/\blab\b/i.test(title)) return 'lab'
  if (/discussion/i.test(entity) || /\bdiscussion\b/i.test(title)) return 'discussion'
  if (/\breading\b/i.test(title)) return 'reading'
  if (/\blecture\b/i.test(title)) return 'lecture'
  return 'assignment'
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function currentCourses(courses: BrightspaceCoursePayload[], now: Date) {
  const at = now.getTime()
  const current: BrightspaceCoursePayload[] = []
  const skipped: Array<{ course: BrightspaceCoursePayload; reason: string }> = []
  for (const course of courses) {
    const start = Date.parse(course.startDate ?? '')
    const end = Date.parse(course.endDate ?? '')
    let reason: string | null = null
    if (!course.isActive) reason = 'inactive enrollment'
    else if (!Number.isNaN(start) && start > at) reason = 'course has not started'
    else if (!Number.isNaN(end) && end < at) reason = 'course has ended'
    else {
      const term = termWindow(course.name)
      if (term && at < term.start) reason = 'course term has not started'
      else if (term && at > term.end) reason = 'course term has ended'
    }
    if (reason) skipped.push({ course, reason })
    else current.push(course)
  }
  return { current, skipped }
}

class BrightspaceHttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
  }
}

function isHttpStatus(error: unknown, status: number) {
  return error instanceof BrightspaceHttpError && error.status === status
}

function termWindow(name: string) {
  const match = name.match(/\b(Spring|Summer|Fall|Winter)\s+(20\d{2})\b/i)
  if (!match) return null
  const year = Number(match[2])
  const season = match[1].toLowerCase()
  if (season === 'spring') return { start: Date.UTC(year, 0, 1), end: Date.UTC(year, 5, 1) }
  if (season === 'summer') return { start: Date.UTC(year, 4, 1), end: Date.UTC(year, 7, 20) }
  if (season === 'fall') return { start: Date.UTC(year, 7, 1), end: Date.UTC(year + 1, 0, 15) }
  return { start: Date.UTC(year, 11, 1), end: Date.UTC(year + 1, 2, 1) }
}

function flattenToc(toc: any) {
  const rows: Array<{ topicId: number; title: string; type: string; module: string }> = []
  const walk = (modules: any[], parents: string[]) => {
    for (const module of modules ?? []) {
      const here = [...parents, typeof module?.Title === 'string' ? module.Title : '']
      for (const topic of module?.Topics ?? []) {
        if (typeof topic?.TopicId !== 'number') continue
        rows.push({
          topicId: topic.TopicId, title: String(topic.Title ?? ''),
          type: String(topic.TypeIdentifier ?? ''), module: here.join(' / ')
        })
      }
      walk(module?.Modules ?? [], here)
    }
  }
  walk(toc?.Modules ?? [], [])
  return rows
}

function filenameFromDisposition(disposition: string | null, fallback: string) {
  const header = disposition ?? ''
  const encoded = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header)
  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(header)
  let value = encoded?.[1] ?? plain?.[1] ?? fallback
  try { value = decodeURIComponent(value.trim()) } catch { value = value.trim() }
  const safe = path.basename(value.replace(/\\/g, '/')).replace(/^\.+/, '').replace(/[<>:"/\\|?*]/g, '_').trim()
  return safe || fallback
}

function htmlToText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
