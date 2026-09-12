import fs from 'node:fs'
import path from 'node:path'
import initSqlJs, { Database as SqlDatabase } from 'sql.js'
import type { BrightspacePayload } from './brightspace'
import type { GradescopePayload } from './gradescope'
import { academicCourseCode, normalizeCourseCode, normalizedCourseName } from './course-code'
import { parseSyllabus } from './syllabus-parser'

type Row = Record<string, string | number | null>

const now = () => new Date().toISOString()

export class DatabaseService {
  private db!: SqlDatabase
  readonly filePath: string

  private constructor(filePath: string) {
    this.filePath = filePath
  }

  static async create(filePath: string) {
    const SQL = await initSqlJs({
      locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm')
    })
    const service = new DatabaseService(filePath)
    service.db = fs.existsSync(filePath)
      ? new SQL.Database(fs.readFileSync(filePath))
      : new SQL.Database()
    service.migrate()
    service.reparseStoredSyllabi()
    return service
  }

  private migrate() {
    this.db.run(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS courses (
        id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT, instructor TEXT,
        term TEXT, color_key TEXT NOT NULL, timezone TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        title TEXT NOT NULL, type TEXT NOT NULL, due_at TEXT NOT NULL, due_timezone TEXT NOT NULL,
        release_at TEXT, status TEXT NOT NULL, source_type TEXT NOT NULL,
        source_label TEXT, source_external_id TEXT, raw_source_text TEXT,
        confidence REAL, user_edited INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_due_idx ON events(due_at);
      CREATE TABLE IF NOT EXISTS syllabus_info (
        course_id TEXT PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
        file_path TEXT, file_name TEXT, attendance_policy TEXT, late_policy TEXT,
        office_hours TEXT, raw_summary TEXT, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS grading_items (
        id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        label TEXT NOT NULL, weight REAL NOT NULL, points REAL, target_points REAL,
        current_points REAL, current_mode TEXT NOT NULL DEFAULT 'earned',
        user_edited INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS detected_events (
        id TEXT PRIMARY KEY, course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
        course_code TEXT, title TEXT NOT NULL, type TEXT NOT NULL, due_at TEXT NOT NULL,
        due_timezone TEXT NOT NULL, source_type TEXT NOT NULL, source_label TEXT,
        raw_source_text TEXT, confidence REAL, state TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS event_status_overrides (
        course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        canonical_title TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY (course_id, canonical_title)
      );
      CREATE TABLE IF NOT EXISTS event_status_overrides_v2 (
        event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
        status TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS course_meetings (
        id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL,
        location TEXT NOT NULL DEFAULT '', instructor TEXT NOT NULL DEFAULT '', label TEXT NOT NULL DEFAULT '',
        source_type TEXT NOT NULL DEFAULT 'image_ocr', source_image_name TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS event_plans (
        event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
        planned_date TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `)
    this.ensureColumn('detected_events', 'source_external_id', 'TEXT')
    this.ensureColumn('syllabus_info', 'source_type', 'TEXT')
    this.ensureColumn('syllabus_info', 'source_external_id', 'TEXT')
    this.ensureColumn('syllabus_info', 'raw_text', 'TEXT')
    this.ensureColumn('syllabus_info', 'user_edited', 'INTEGER NOT NULL DEFAULT 0')
    const gradingItemsHadEditMarker = this.rows('PRAGMA table_info(grading_items)').some((item) => item.name === 'user_edited')
    this.ensureColumn('grading_items', 'points', 'REAL')
    this.ensureColumn('grading_items', 'target_points', 'REAL')
    this.ensureColumn('grading_items', 'current_points', 'REAL')
    this.ensureColumn('grading_items', 'current_mode', "TEXT NOT NULL DEFAULT 'earned'")
    this.ensureColumn('grading_items', 'user_edited', 'INTEGER NOT NULL DEFAULT 0')
    // The old schema could not distinguish a parsed row from one the user later edited.
    // Protect every pre-migration row once; newly parsed rows keep the default marker.
    if (!gradingItemsHadEditMarker) this.db.run('UPDATE grading_items SET user_edited = 1')
    this.db.run('CREATE INDEX IF NOT EXISTS detected_external_idx ON detected_events(source_external_id)')
    for (const event of this.rows('SELECT id, status, updated_at FROM events WHERE user_edited = 1 ORDER BY updated_at')) {
      this.db.run(`INSERT OR REPLACE INTO event_status_overrides_v2
        (event_id, status, updated_at) VALUES (?, ?, ?)`, [event.id, event.status, event.updated_at])
    }
    this.persist()
  }

  private ensureColumn(table: string, column: string, definition: string) {
    const columns = this.rows(`PRAGMA table_info(${table})`)
    if (!columns.some((item) => item.name === column)) {
      this.db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
  }

  private rows(sql: string, params: Array<string | number | null> = []): Row[] {
    const statement = this.db.prepare(sql)
    statement.bind(params)
    const result: Row[] = []
    while (statement.step()) result.push(statement.getAsObject() as Row)
    statement.free()
    return result
  }

  private persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.tmp`
    const backupPath = `${this.filePath}.bak`
    const backupTemporaryPath = `${backupPath}.tmp`
    try {
      fs.writeFileSync(temporaryPath, Buffer.from(this.db.export()))
      if (fs.existsSync(this.filePath)) {
        fs.copyFileSync(this.filePath, backupTemporaryPath)
        fs.renameSync(backupTemporaryPath, backupPath)
      }
      fs.renameSync(temporaryPath, this.filePath)
    } finally {
      if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force:true })
      if (fs.existsSync(backupTemporaryPath)) fs.rmSync(backupTemporaryPath, { force:true })
    }
  }

  private reparseStoredSyllabi() {
    const parserVersion = '6'
    const installedVersion = String(this.rows("SELECT value FROM settings WHERE key = 'syllabusParserVersion'")[0]?.value ?? '')
    if (installedVersion === parserVersion) return
    const stored = this.rows(`SELECT s.*, c.name, c.timezone
      FROM syllabus_info s JOIN courses c ON c.id = s.course_id
      WHERE s.source_type = 'brightspace_api' AND LENGTH(COALESCE(s.raw_text, '')) > 0`)
    const stamp = now()
    this.db.run('BEGIN TRANSACTION')
    try {
      for (const row of stored) {
        const remoteCourseId = Number(String(row.source_external_id ?? '').match(/^brightspace:syllabus:(\d+):/)?.[1])
        if (!remoteCourseId) continue
        const parsed = parseSyllabus({
          courseId: remoteCourseId,
          text: String(row.raw_text),
          timezone: String(row.timezone),
          courseName: String(row.name)
        })
        if (parsed.instructor) {
          this.db.run("UPDATE courses SET instructor = ?, updated_at = ? WHERE id = ? AND TRIM(COALESCE(instructor, '')) = ''",
            [parsed.instructor, stamp, row.course_id])
        }
        if (!Boolean(row.user_edited)) {
          this.db.run(`UPDATE syllabus_info SET attendance_policy = ?, late_policy = ?,
            office_hours = ?, raw_summary = ?, updated_at = ? WHERE course_id = ?`, [
            richerExtract(String(row.attendance_policy ?? ''), parsed.attendancePolicy),
            richerExtract(String(row.late_policy ?? ''), parsed.latePolicy),
            richerExtract(String(row.office_hours ?? ''), parsed.officeHours),
            richerExtract(String(row.raw_summary ?? ''), parsed.rawSummary),
            stamp, row.course_id
          ])
        }
        const existingGrades = this.rows('SELECT id, user_edited FROM grading_items WHERE course_id = ?', [row.course_id])
        if (parsed.gradingItems.length && (existingGrades.length === 0 || existingGrades.every((item) => !Boolean(item.user_edited)))) {
          this.db.run('DELETE FROM grading_items WHERE course_id = ?', [row.course_id])
          for (const item of parsed.gradingItems) {
            this.db.run('INSERT INTO grading_items (id, course_id, label, weight) VALUES (?, ?, ?, ?)',
              [item.id, row.course_id, item.label, item.weight])
          }
        }
        for (const event of parsed.events) {
          this.upsertImportedEvent({
            id: event.id, courseId: String(row.course_id), title: event.title, type: event.type,
            dueAt: event.dueAt, timezone: String(row.timezone), sourceType: 'brightspace_syllabus',
            sourceLabel: 'Brightspace syllabus', rawSourceText: String(row.raw_text).slice(0, 1000), stamp
          })
        }
      }
      this.db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('syllabusParserVersion', ?)", [parserVersion])
      this.db.run('COMMIT')
      this.persist()
    } catch (error) {
      this.db.run('ROLLBACK')
      throw error
    }
  }

  getState() {
    return {
      courses: this.rows('SELECT * FROM courses ORDER BY code').map(mapCourse),
      events: this.rows('SELECT * FROM events ORDER BY due_at').map(mapEvent),
      syllabi: this.rows('SELECT * FROM syllabus_info').map(mapSyllabus),
      gradingItems: this.rows('SELECT * FROM grading_items ORDER BY rowid').map((r) => ({
        id: r.id, courseId: r.course_id, label: r.label, weight: r.weight,
        points: r.points, targetPoints: r.target_points, currentPoints: r.current_points,
        currentMode: r.current_mode === 'lost' ? 'lost' : 'earned', userEdited: Boolean(r.user_edited)
      })),
      meetings: this.rows('SELECT * FROM course_meetings ORDER BY day_of_week, start_time').map(mapMeeting),
      detectedEvents: this.rows("SELECT * FROM detected_events WHERE state = 'pending' ORDER BY created_at DESC").map(mapDetected),
      eventPlans: this.rows('SELECT event_id, planned_date FROM event_plans ORDER BY planned_date').map((r) => ({
        eventId: String(r.event_id), plannedDate: String(r.planned_date)
      })),
      settings: Object.fromEntries(this.rows('SELECT * FROM settings').map((r) => [r.key, r.value]))
    }
  }

  saveCourse(input: any) {
    const stamp = now()
    const existing = this.rows('SELECT created_at FROM courses WHERE id = ?', [input.id])[0]
    this.db.run(`INSERT OR REPLACE INTO courses
      (id, code, name, instructor, term, color_key, timezone, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      input.id, input.code.trim().toUpperCase(), input.name ?? '', input.instructor ?? '',
      input.term ?? '', input.colorKey ?? 'blue', input.timezone ?? 'America/Indiana/Indianapolis',
      input.notes ?? '', existing?.created_at ?? stamp, stamp
    ])
    this.persist()
    return this.getState()
  }

  deleteCourse(id: string) {
    this.db.run('DELETE FROM courses WHERE id = ?', [id])
    this.persist()
    return this.getState()
  }

  saveEvent(input: any) {
    const stamp = now()
    const existing = this.rows('SELECT created_at FROM events WHERE id = ?', [input.id])[0]
    const existingPlan = this.rows('SELECT planned_date FROM event_plans WHERE event_id = ?', [input.id])[0]
    this.db.run(`INSERT OR REPLACE INTO events
      (id, course_id, title, type, due_at, due_timezone, release_at, status,
       source_type, source_label, source_external_id, raw_source_text, confidence,
       user_edited, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      input.id, input.courseId, input.title.trim(), input.type, input.dueAt,
      input.dueTimezone, input.releaseAt ?? null, input.status, input.sourceType ?? 'manual',
      input.sourceLabel ?? null, input.sourceExternalId ?? null, input.rawSourceText ?? null,
      input.confidence ?? null, input.userEdited ? 1 : 0, existing?.created_at ?? stamp, stamp
    ])
    if (existingPlan) {
      this.db.run('INSERT OR REPLACE INTO event_plans (event_id, planned_date, updated_at) VALUES (?, ?, ?)',
        [input.id, existingPlan.planned_date, stamp])
    }
    if (input.userEdited) this.updateEventStatusCluster(String(input.id), String(input.status), stamp)
    this.persist()
    return this.getState()
  }

  saveEventStatus(input: any) {
    const stamp = now()
    const status = String(input.status ?? 'not_done')
    this.db.run('BEGIN TRANSACTION')
    try {
      this.updateEventStatusCluster(String(input.id ?? ''), status, stamp)
      this.db.run('COMMIT')
    } catch (error) {
      this.db.run('ROLLBACK')
      throw error
    }
    this.persist()
    return this.getState()
  }

  private updateEventStatusCluster(eventId: string, status: string, stamp: string) {
    const target = this.rows('SELECT id, course_id, title, due_at FROM events WHERE id = ?', [eventId])[0]
    if (!target) return
    const canonicalTitle = canonicalImportedTitle(String(target.title))
    const targetDueAt = Date.parse(String(target.due_at))
    const duplicateWindowMs = 12 * 60 * 60 * 1000
    for (const event of this.rows('SELECT id, title, due_at FROM events WHERE course_id = ?', [target.course_id])) {
      if (canonicalImportedTitle(String(event.title)) !== canonicalTitle) continue
      const dueAt = Date.parse(String(event.due_at))
      if (event.id !== target.id && (!Number.isFinite(targetDueAt) || !Number.isFinite(dueAt) || Math.abs(dueAt - targetDueAt) > duplicateWindowMs)) continue
      this.db.run(`INSERT OR REPLACE INTO event_status_overrides_v2
        (event_id, status, updated_at) VALUES (?, ?, ?)`, [event.id, status, stamp])
      this.db.run('UPDATE events SET status = ?, updated_at = ? WHERE id = ?', [status, stamp, event.id])
    }
  }

  deleteEvent(id: string) {
    this.db.run('DELETE FROM events WHERE id = ?', [id])
    this.persist()
    return this.getState()
  }

  saveSyllabus(input: any) {
    const existing = this.rows('SELECT * FROM syllabus_info WHERE course_id = ?', [input.courseId])[0]
    this.db.run(`INSERT OR REPLACE INTO syllabus_info
      (course_id, file_path, file_name, attendance_policy, late_policy, office_hours, raw_summary,
       updated_at, source_type, source_external_id, raw_text, user_edited)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`, [
      input.courseId, input.filePath ?? existing?.file_path ?? null, input.fileName ?? existing?.file_name ?? null,
      input.attendancePolicy ?? '', input.latePolicy ?? '', input.officeHours ?? '',
      input.rawSummary ?? '', now(), existing?.source_type ?? input.sourceType ?? null,
      existing?.source_external_id ?? input.sourceExternalId ?? null,
      existing?.raw_text ?? input.rawText ?? null
    ])
    this.persist()
    return this.getState()
  }

  saveGradingItems(input: any) {
    this.db.run('BEGIN TRANSACTION')
    try {
      this.db.run('DELETE FROM grading_items WHERE course_id = ?', [input.courseId])
      for (const item of input.items ?? []) {
        this.db.run(`INSERT INTO grading_items
          (id, course_id, label, weight, points, target_points, current_points, current_mode, user_edited)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`, [
          item.id, input.courseId, String(item.label ?? '').trim(), finiteNumber(item.weight) ?? 0,
          finiteNumber(item.points), finiteNumber(item.targetPoints), finiteNumber(item.currentPoints),
          item.currentMode === 'lost' ? 'lost' : 'earned'
        ])
      }
      const displayMode = input.displayMode === 'points' ? 'points' : 'percentage'
      this.db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [`gradingDisplayMode:${input.courseId}`, displayMode])
      this.db.run('COMMIT')
      this.persist()
    } catch (error) {
      this.db.run('ROLLBACK')
      throw error
    }
    return this.getState()
  }

  saveSchedule(input: any) {
    const stamp = now()
    this.db.run('BEGIN TRANSACTION')
    try {
      for (const item of input.meetings ?? []) {
        this.db.run(`INSERT INTO course_meetings
          (id, course_id, day_of_week, start_time, end_time, location, instructor, label,
           source_type, source_image_name, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            course_id = excluded.course_id, day_of_week = excluded.day_of_week,
            start_time = excluded.start_time, end_time = excluded.end_time,
            location = excluded.location, instructor = excluded.instructor,
            label = excluded.label, source_type = excluded.source_type,
            source_image_name = excluded.source_image_name, updated_at = excluded.updated_at`, [
          item.id, item.courseId, Number(item.dayOfWeek), item.startTime, item.endTime,
          item.location ?? '', item.instructor ?? '', item.label ?? '', item.sourceType ?? 'image_ocr',
          item.sourceImageName ?? null, item.createdAt ?? stamp, stamp
        ])
      }
      for (const id of input.deletedIds ?? []) this.db.run('DELETE FROM course_meetings WHERE id = ?', [String(id)])
      this.db.run('COMMIT')
    } catch (error) {
      this.db.run('ROLLBACK')
      throw error
    }
    this.persist()
    return this.getState()
  }

  saveEventPlans(input: any) {
    const stamp = now()
    this.db.run('BEGIN TRANSACTION')
    try {
      for (const item of input.plans ?? []) {
        const eventId = String(item.eventId ?? '')
        if (!eventId) continue
        if (item.plannedDate) {
          this.db.run(`INSERT OR REPLACE INTO event_plans
            (event_id, planned_date, updated_at) VALUES (?, ?, ?)`, [eventId, String(item.plannedDate), stamp])
        } else {
          this.db.run('DELETE FROM event_plans WHERE event_id = ?', [eventId])
        }
      }
      this.db.run('COMMIT')
    } catch (error) {
      this.db.run('ROLLBACK')
      throw error
    }
    this.persist()
    return this.getState()
  }

  saveDetected(input: any) {
    this.db.run(`INSERT INTO detected_events
      (id, course_id, course_code, title, type, due_at, due_timezone, source_type,
       source_label, source_external_id, raw_source_text, confidence, state, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`, [
      input.id, input.courseId ?? null, input.courseCode ?? null, input.title, input.type,
      input.dueAt, input.dueTimezone, input.sourceType, input.sourceLabel ?? null,
      input.sourceExternalId ?? null, input.rawSourceText ?? null, input.confidence ?? null, now()
    ])
    this.persist()
    return this.getState()
  }

  resolveDetected(input: any) {
    if (input.action === 'confirm' && input.event) this.saveEvent(input.event)
    this.db.run('UPDATE detected_events SET state = ? WHERE id = ?', [input.action, input.id])
    this.persist()
    return this.getState()
  }

  saveSetting(input: any) {
    this.db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [input.key, String(input.value)])
    this.persist()
    return this.getState()
  }

  importBrightspace(payload: BrightspacePayload) {
    const stamp = now()
    const defaultTimezone = String(this.rows("SELECT value FROM settings WHERE key = 'defaultTimezone'")[0]?.value ?? 'America/Indiana/Indianapolis')
    const courses = this.rows('SELECT id, code FROM courses')
    const courseIds = new Map<number, string>()
    let coursesAdded = 0
    let coursesRemoved = 0
    let itemsAdded = 0
    let itemsUpdated = 0
    let duplicatesSkipped = 0
    let itemsWithoutDueDate = 0
    let syllabiImported = 0
    let syllabusEventsAdded = 0

    const academicCourses = payload.courses.filter((course) => Boolean(academicCourseCode(course.code, course.name)))
    this.db.run('BEGIN TRANSACTION')
    try {
      for (const course of academicCourses) {
        const deterministicId = `brightspace-course-${course.id}`
        const code = academicCourseCode(course.code, course.name)!
        const byId = courses.find((existing) => existing.id === deterministicId)
        const byCode = courses.find((existing) => normalizeCourseCode(String(existing.code)) === normalizeCourseCode(code))
        const localId = String((byId ?? byCode)?.id ?? deterministicId)
        courseIds.set(course.id, localId)
        if (!byId && !byCode) {
          this.db.run(`INSERT INTO courses
            (id, code, name, instructor, term, color_key, timezone, notes, created_at, updated_at)
            VALUES (?, ?, ?, '', ?, ?, ?, '', ?, ?)`, [
            localId, code, course.name, extractTerm(course.name), colorFor(course.id), defaultTimezone, stamp, stamp
          ])
          courses.push({ id: localId, code })
          coursesAdded++
        }
      }

      for (const excludedCourseId of payload.excludedCourseIds) {
        this.db.run(`DELETE FROM detected_events
          WHERE source_type = 'brightspace_api' AND state = 'pending'
          AND source_external_id LIKE ?`, [`brightspace:%:${excludedCourseId}:%`])
      }

      const retainedCourseIds = new Set(academicCourses.map((course) => `brightspace-course-${course.id}`))
      for (const imported of this.rows("SELECT id, code, name, notes FROM courses WHERE id LIKE 'brightspace-course-%'")) {
        const importedId = String(imported.id)
        if (!academicCourseCode(String(imported.code), String(imported.name))) {
          this.db.run('DELETE FROM courses WHERE id = ?', [importedId])
          coursesRemoved++
          continue
        }
        if (retainedCourseIds.has(importedId) || String(imported.notes ?? '').trim()) continue
        const hasUserData = this.rows(`SELECT
          (SELECT COUNT(*) FROM events WHERE course_id = ?) +
          (SELECT COUNT(*) FROM syllabus_info WHERE course_id = ?) +
          (SELECT COUNT(*) FROM grading_items WHERE course_id = ?) +
          (SELECT COUNT(*) FROM detected_events WHERE course_id = ?) AS count`,
          [importedId, importedId, importedId, importedId])[0]?.count
        if (Number(hasUserData ?? 0) > 0) continue
        this.db.run('DELETE FROM courses WHERE id = ?', [importedId])
        coursesRemoved++
      }

      for (const item of payload.items) {
        if (!item.dueDate) { itemsWithoutDueDate++; continue }
        const localCourseId = courseIds.get(item.courseId)
        if (!localCourseId) continue
        const externalId = `brightspace:${item.kind}:${item.courseId}:${item.externalId ?? item.id}`
        const outcome = this.upsertImportedEvent({
          id: externalId, courseId: localCourseId, title: item.title, type: item.kind,
          dueAt: item.dueDate, timezone: defaultTimezone, sourceType: 'brightspace_api',
          sourceLabel: 'Brightspace', rawSourceText: `Brightspace API\n${item.url}`, stamp
        })
        if (outcome === 'added') itemsAdded++
        else if (outcome === 'updated') itemsUpdated++
        else duplicatesSkipped++
      }

      for (const syllabus of payload.syllabi) {
        const localCourseId = courseIds.get(syllabus.courseId)
        if (!localCourseId) continue
        const existing = this.rows('SELECT * FROM syllabus_info WHERE course_id = ?', [localCourseId])[0]
        if (syllabus.instructor) {
          this.db.run("UPDATE courses SET instructor = ?, updated_at = ? WHERE id = ? AND TRIM(COALESCE(instructor, '')) = ''",
            [syllabus.instructor, stamp, localCourseId])
        }
        const existingRaw = String(existing?.raw_text ?? '')
        const incomingRaw = String(syllabus.rawText ?? '')
        const incomingIsRicher = !existingRaw || incomingRaw.length >= existingRaw.length
        const manuallyEdited = Boolean(existing?.user_edited)
        const chooseField = (column: string, incoming: string) => manuallyEdited
          ? String(existing?.[column] ?? '')
          : richerExtract(String(existing?.[column] ?? ''), incoming)
        this.db.run(`INSERT OR REPLACE INTO syllabus_info
          (course_id, file_path, file_name, attendance_policy, late_policy, office_hours,
           raw_summary, updated_at, source_type, source_external_id, raw_text, user_edited)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'brightspace_api', ?, ?, ?)`, [
          localCourseId,
          syllabus.filePath ?? existing?.file_path ?? null,
          syllabus.fileName ?? existing?.file_name ?? null,
          chooseField('attendance_policy', syllabus.attendancePolicy),
          chooseField('late_policy', syllabus.latePolicy),
          chooseField('office_hours', syllabus.officeHours),
          chooseField('raw_summary', syllabus.rawSummary),
          stamp,
          incomingIsRicher ? syllabus.sourceExternalId : existing?.source_external_id ?? syllabus.sourceExternalId,
          incomingIsRicher ? incomingRaw : existingRaw,
          manuallyEdited ? 1 : 0
        ])
        syllabiImported++

        const existingGrades = this.rows('SELECT id, label, weight, user_edited FROM grading_items WHERE course_id = ?', [localCourseId])
        const incomingGradeTotal = syllabus.gradingItems.reduce((sum, item) => sum + Number(item.weight), 0)
        const plausibleGrades = syllabus.gradingItems.length > 0 && incomingGradeTotal >= 90 && incomingGradeTotal <= 110
        const autoGrades = existingGrades.length === 0 || existingGrades.every((item) => !Boolean(item.user_edited))
        const gradeResultIsNotADowngrade = existingGrades.length === 0 || incomingIsRicher || syllabus.gradingItems.length >= existingGrades.length
        if (plausibleGrades && autoGrades && gradeResultIsNotADowngrade) {
          this.db.run('DELETE FROM grading_items WHERE course_id = ?', [localCourseId])
          for (const item of syllabus.gradingItems) {
            this.db.run('INSERT INTO grading_items (id, course_id, label, weight) VALUES (?, ?, ?, ?)',
              [item.id, localCourseId, item.label, item.weight])
          }
        }
        for (const event of syllabus.events) {
          const outcome = this.upsertImportedEvent({
            id: event.id, courseId: localCourseId, title: event.title, type: event.type,
            dueAt: event.dueAt, timezone: defaultTimezone, sourceType: 'brightspace_syllabus',
            sourceLabel: 'Brightspace syllabus', rawSourceText: syllabus.filePath ?? syllabus.rawText.slice(0, 1000), stamp
          })
          if (outcome === 'added') syllabusEventsAdded++
          else if (outcome === 'updated') itemsUpdated++
        }
      }
      this.db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('brightspaceBaseUrl', ?)", [payload.baseUrl])
      this.db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('brightspaceLastSyncAt', ?)", [stamp])
      this.db.run('COMMIT')
    } catch (error) {
      this.db.run('ROLLBACK')
      throw error
    }
    this.persist()
    return {
      state: this.getState(),
      summary: { coursesFound: academicCourses.length, coursesAdded, coursesRemoved, itemsFound: payload.items.length,
        itemsAdded, itemsUpdated, duplicatesSkipped, itemsWithoutDueDate, syllabiFound: payload.stats.syllabiFound,
        syllabiImported, syllabusEventsAdded, warnings: payload.warnings, syncedAt: stamp,
        enrolledCourses: payload.stats.enrolledCourses, currentCourses: payload.stats.currentCourses,
        skippedByAccessWindow: payload.stats.skippedByAccessWindow,
        skippedNonAcademic: payload.stats.skippedNonAcademic,
        inaccessibleCourses: payload.stats.inaccessibleCourses }
    }
  }

  importGradescope(payload: GradescopePayload) {
    const stamp = now()
    const defaultTimezone = String(this.rows("SELECT value FROM settings WHERE key = 'defaultTimezone'")[0]?.value ?? 'America/Indiana/Indianapolis')
    const courses = this.rows('SELECT id, code, name FROM courses')
    const courseIds = new Map<number, string>()
    let coursesAdded = 0
    let itemsAdded = 0
    let itemsUpdated = 0
    let duplicatesSkipped = 0
    let itemsWithoutDueDate = 0

    this.db.run('BEGIN TRANSACTION')
    try {
      for (const course of payload.courses) {
        const deterministicId = `gradescope-course-${course.id}`
        const code = academicCourseCode(course.shortName, course.fullName)
        if (!code) continue
        const byId = courses.find((existing) => existing.id === deterministicId)
        const byCode = courses.find((existing) => normalizeCourseCode(String(existing.code)) === normalizeCourseCode(code))
        const byName = courses.find((existing) => normalizedCourseName(String(existing.name)) === normalizedCourseName(course.fullName))
        const localId = String((byId ?? byCode ?? byName)?.id ?? deterministicId)
        courseIds.set(course.id, localId)
        if (!byId && !byCode && !byName) {
          this.db.run(`INSERT INTO courses
            (id, code, name, instructor, term, color_key, timezone, notes, created_at, updated_at)
            VALUES (?, ?, ?, '', ?, ?, ?, '', ?, ?)`, [
            localId, code, course.fullName || course.shortName, course.term, colorFor(course.id), defaultTimezone, stamp, stamp
          ])
          courses.push({ id: localId, code, name: course.fullName })
          coursesAdded++
        }
      }

      for (const course of payload.courses) {
        const localCourseId = courseIds.get(course.id)
        if (!localCourseId) continue
        const activeIds = new Set(payload.items
          .filter((item) => item.courseId === course.id && item.dueDate)
          .map((item) => `gradescope:${item.courseId}:${item.id}`))
        for (const existing of this.rows(
          "SELECT id, source_external_id, user_edited FROM events WHERE source_type = 'gradescope' AND source_external_id LIKE ?",
          [`gradescope:${course.id}:%`]
        )) {
          if (!Boolean(existing.user_edited) && !activeIds.has(String(existing.source_external_id))) {
            this.db.run('DELETE FROM events WHERE id = ?', [String(existing.id)])
          }
        }
      }

      for (const item of payload.items) {
        if (!item.dueDate) { itemsWithoutDueDate++; continue }
        const localCourseId = courseIds.get(item.courseId)
        if (!localCourseId) continue
        const externalId = `gradescope:${item.courseId}:${item.id}`
        const outcome = this.upsertImportedEvent({
          id: externalId,
          courseId: localCourseId,
          title: item.title,
          type: 'assignment',
          dueAt: item.dueDate,
          timezone: defaultTimezone,
          status: item.submitted ? 'done' : 'not_done',
          sourceType: 'gradescope',
          sourceLabel: 'Gradescope',
          rawSourceText: `Gradescope\n${item.url}${item.lateDueDate ? `\nLate due: ${item.lateDueDate}` : ''}`,
          stamp
        })
        if (outcome === 'added') itemsAdded++
        else if (outcome === 'updated') itemsUpdated++
        else duplicatesSkipped++
      }
      this.db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('gradescopeLastSyncAt', ?)", [stamp])
      this.db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('gradescopeAutoSync', 'true')")
      this.db.run('COMMIT')
    } catch (error) {
      this.db.run('ROLLBACK')
      throw error
    }
    this.persist()
    return {
      state: this.getState(),
      summary: {
        coursesFound: payload.stats.coursesFound,
        currentCourses: payload.stats.currentCourses,
        skippedTerms: payload.stats.skippedTerms,
        coursesAdded,
        itemsFound: payload.items.length,
        itemsAdded,
        itemsUpdated,
        duplicatesSkipped,
        itemsWithoutDueDate,
        warnings: payload.warnings,
        syncedAt: stamp
      }
    }
  }

  private upsertImportedEvent(input: {
    id: string; courseId: string; title: string; type: string; dueAt: string; timezone: string
    sourceType: string; sourceLabel: string; rawSourceText: string; stamp: string; status?: string
  }): 'added' | 'updated' | 'duplicate' {
    const statusOverride = this.rows('SELECT status FROM event_status_overrides_v2 WHERE event_id = ? LIMIT 1', [input.id])[0]?.status
    const existing = this.rows('SELECT id, user_edited FROM events WHERE source_external_id = ? LIMIT 1', [input.id])[0]
    if (existing) {
      if (!Boolean(existing.user_edited)) {
        this.db.run(`UPDATE events SET title = ?, type = ?, due_at = ?, due_timezone = ?,
          source_label = ?, raw_source_text = ?,
          status = CASE WHEN ? IS NOT NULL THEN ? WHEN ? = 'done' THEN 'done' ELSE status END,
          confidence = 1, updated_at = ? WHERE id = ?`, [
          input.title, input.type, input.dueAt, input.timezone, input.sourceLabel,
          input.rawSourceText, statusOverride ?? null, statusOverride ?? null,
          input.status ?? 'not_done', input.stamp, existing.id
        ])
        return 'updated'
      }
      return 'duplicate'
    }
    const decision = this.rows('SELECT state FROM detected_events WHERE source_external_id = ? LIMIT 1', [input.id])[0]
    if (decision?.state === 'ignored') return 'duplicate'
    const likelyDuplicate = this.rows('SELECT id, title, due_at FROM events WHERE course_id = ?', [input.courseId])
      .some((event) => normalizedCourseName(String(event.title)) === normalizedCourseName(input.title)
        && Math.abs(Date.parse(String(event.due_at)) - Date.parse(input.dueAt)) <= 12 * 60 * 60 * 1000)
    this.db.run("DELETE FROM detected_events WHERE source_external_id = ? AND state = 'pending'", [input.id])
    if (likelyDuplicate) return 'duplicate'
    this.db.run(`INSERT INTO events
      (id, course_id, title, type, due_at, due_timezone, release_at, status,
       source_type, source_label, source_external_id, raw_source_text, confidence,
       user_edited, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 1, 0, ?, ?)`, [
      input.id, input.courseId, input.title, input.type, input.dueAt, input.timezone,
      statusOverride ?? input.status ?? 'not_done', input.sourceType, input.sourceLabel, input.id, input.rawSourceText, input.stamp, input.stamp
    ])
    return 'added'
  }

  resetDemo() {
    this.db.run('DELETE FROM detected_events; DELETE FROM grading_items; DELETE FROM syllabus_info; DELETE FROM events; DELETE FROM courses; DELETE FROM settings;')
    this.seedDemo()
    return this.getState()
  }

  private seedDemo() {
    const stamp = now()
    const courses = [
      ['cs240', 'CS 240', 'Programming in C', 'Dr. Rivera', 'Fall 2026', 'blue', 'Remember to ask about Lab 4 memory allocation.\n\nExam 1 covers pointers, arrays, and structs.'],
      ['ma351', 'MA 351', 'Elementary Linear Algebra', 'Prof. Shah', 'Fall 2026', 'violet', 'Office hours are especially useful before written homework is due.'],
      ['ma375', 'MA 375', 'Introduction to Discrete Mathematics', 'Dr. Becker', 'Fall 2026', 'amber', ''],
      ['psy222', 'PSY 222', 'Introduction to Behavioral Neuroscience', 'Prof. Chen', 'Fall 2026', 'rose', ''],
      ['stat350', 'STAT 350', 'Introduction to Statistics', 'Dr. Nguyen', 'Fall 2026', 'teal', '']
    ]
    for (const c of courses) {
      this.db.run('INSERT INTO courses VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [c[0], c[1], c[2], c[3], c[4], c[5], 'America/Indiana/Indianapolis', c[6], stamp, stamp])
    }
    const events = [
      ['evt1','cs240','Lab 2','lab','2026-09-04T21:00:00-04:00','done','manual','Manual'],
      ['evt2','psy222','Module #1 Discussion Reflection','discussion','2026-09-04T23:59:00-04:00','done','brightspace_email','Brightspace Email'],
      ['evt3','stat350','Quiz #1','quiz','2026-09-04T23:59:00-04:00','done','brightspace_email','Brightspace Email'],
      ['evt4','cs240','Lab 3','lab','2026-09-09T21:00:00-04:00','not_done','manual','Manual'],
      ['evt5','psy222','Module #2 Discussion','discussion','2026-09-09T23:59:00-04:00','in_progress','brightspace_email','Brightspace Email'],
      ['evt6','ma375','Homework 3','assignment','2026-09-10T23:59:00-04:00','not_done','syllabus','Syllabus'],
      ['evt7','stat350','Quiz #2','quiz','2026-09-11T23:59:00-04:00','not_done','brightspace_email','Brightspace Email'],
      ['evt8','cs240','Lab 4','lab','2026-09-12T21:00:00-04:00','not_done','gradescope','Gradescope import'],
      ['evt9','ma351','Homework 4','assignment','2026-09-15T23:59:00-04:00','not_done','manual','Manual'],
      ['evt10','ma351','Exam 1','exam','2026-09-22T10:30:00-04:00','not_done','syllabus','Syllabus'],
      ['evt11','cs240','Exam 1','exam','2026-09-24T18:00:00-04:00','not_done','syllabus','Syllabus'],
      ['evt12','stat350','Homework 5','assignment','2026-10-02T23:59:00-04:00','not_done','manual','Manual']
    ]
    for (const e of events) {
      this.db.run(`INSERT INTO events
        (id,course_id,title,type,due_at,due_timezone,status,source_type,source_label,user_edited,created_at,updated_at)
        VALUES (?,?,?,?,?,'America/Indiana/Indianapolis',?,?,?,0,?,?)`, [...e, stamp, stamp])
    }
    const syllabus = [
      ['cs240', 'Attendance is expected for labs.', 'Late labs lose 10% per day.', 'Tuesday 2:00–4:00 PM, LWSN 2142', 'C programming fundamentals, memory, data structures, and systems concepts.'],
      ['ma351', 'Attendance strongly recommended.', 'Written homework accepted up to 24 hours late with penalty.', 'Wednesday 1:30–3:30 PM', 'Linear systems, vector spaces, eigenvalues, and applications.']
    ]
    for (const s of syllabus) this.db.run(`INSERT INTO syllabus_info
      (course_id, file_path, file_name, attendance_policy, late_policy, office_hours, raw_summary, updated_at)
      VALUES (?, NULL, NULL, ?, ?, ?, ?, ?)`, [...s, stamp])
    const grades = [
      ['g1','cs240','Labs',30],['g2','cs240','Homework',10],['g3','cs240','Midterms',30],['g4','cs240','Final',30],
      ['g5','ma351','Homework',25],['g6','ma351','Midterms',45],['g7','ma351','Final',30]
    ]
    for (const g of grades) this.db.run('INSERT INTO grading_items (id, course_id, label, weight) VALUES (?,?,?,?)', g)
    this.db.run("INSERT INTO settings VALUES ('hideCompleted', 'false'); INSERT INTO settings VALUES ('defaultTimezone', 'America/Indiana/Indianapolis');")
    this.persist()
  }
}

function mapCourse(r: Row) {
  return { id:r.id, code:r.code, name:r.name, instructor:r.instructor, term:r.term, colorKey:r.color_key, timezone:r.timezone, notes:r.notes, createdAt:r.created_at, updatedAt:r.updated_at }
}

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}
function mapEvent(r: Row) {
  return { id:r.id, courseId:r.course_id, title:r.title, type:r.type, dueAt:r.due_at, dueTimezone:r.due_timezone, releaseAt:r.release_at, status:r.status, sourceType:r.source_type, sourceLabel:r.source_label, sourceExternalId:r.source_external_id, rawSourceText:r.raw_source_text, confidence:r.confidence, userEdited:Boolean(r.user_edited), createdAt:r.created_at, updatedAt:r.updated_at }
}
function mapSyllabus(r: Row) {
  return { courseId:r.course_id, filePath:r.file_path, fileName:r.file_name, attendancePolicy:r.attendance_policy, latePolicy:r.late_policy, officeHours:r.office_hours, rawSummary:r.raw_summary, sourceType:r.source_type, sourceExternalId:r.source_external_id, rawText:r.raw_text, userEdited:Boolean(r.user_edited), updatedAt:r.updated_at }
}
function mapDetected(r: Row) {
  return { id:r.id, courseId:r.course_id, courseCode:r.course_code, title:r.title, type:r.type, dueAt:r.due_at, dueTimezone:r.due_timezone, sourceType:r.source_type, sourceLabel:r.source_label, sourceExternalId:r.source_external_id, rawSourceText:r.raw_source_text, confidence:r.confidence, state:r.state, createdAt:r.created_at }
}

function mapMeeting(r: Row) {
  return { id:r.id, courseId:r.course_id, dayOfWeek:Number(r.day_of_week), startTime:r.start_time, endTime:r.end_time,
    location:r.location, instructor:r.instructor, label:r.label, sourceType:r.source_type, sourceImageName:r.source_image_name }
}

function canonicalImportedTitle(value: string) {
  return value.trim()
    .replace(/\s*[-–—:]\s*due\s*$/i, '')
    .replace(/\s+\b(?:template|submission)\b\s*$/i, '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function richerExtract(existing: string, incoming: string) {
  const saved = existing.trim()
  const candidate = incoming.trim()
  if (/Course Syllabus\s*:.*\battendance\b.*\bacademic integrity\b/is.test(saved)) return candidate
  if (!saved) return candidate
  if (!candidate) return saved
  // Automatic re-parsing should fill gaps and improve obviously truncated fields without
  // replacing a useful saved extract with a shorter partial render.
  return candidate.length > saved.length * 1.2 ? candidate : saved
}

function extractTerm(value: string) {
  return value.match(/\b(Spring|Summer|Fall|Winter)\s+20\d{2}\b/i)?.[0] ?? ''
}

function colorFor(id: number) {
  const colors = ['blue', 'violet', 'amber', 'rose', 'teal']
  return colors[Math.abs(id) % colors.length]
}
