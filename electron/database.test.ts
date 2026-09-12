import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseService, syllabusSourcePriority } from './database'
import { parseSyllabus } from './syllabus-parser'

const temporaryDirectories: string[] = []

describe('syllabus source safety', () => {
  it('treats a current Simple Syllabus as more authoritative than legacy overview text', () => {
    expect(syllabusSourcePriority('brightspace:syllabus:1644209:simple-syllabus:new')).toBeGreaterThan(
      syllabusSourcePriority('brightspace:syllabus:1644209:legacy-hash')
    )
    expect(syllabusSourcePriority('brightspace:syllabus:1644209:simple-syllabus:short')).toBe(
      syllabusSourcePriority('brightspace:syllabus:1644209:simple-syllabus:long')
    )
  })

  it('replaces longer legacy overview text with a shorter course-scoped Simple Syllabus', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-routine-syllabus-source-'))
    temporaryDirectories.push(directory)
    const database = await DatabaseService.create(path.join(directory, 'test.sqlite'))
    const course = {
      id:1644209, code:'STAT 350', name:'Fall 2026 STAT 350 Online Section - Merge',
      isActive:true, startDate:null, endDate:null
    }
    const payload = (syllabus: ReturnType<typeof parseSyllabus>) => ({
      baseUrl:'https://purdue.brightspace.com', courses:[course], items:[], syllabi:[syllabus],
      warnings:[], excludedCourseIds:[],
      stats:{ enrolledCourses:1, currentCourses:1, skippedByAccessWindow:0, skippedNonAcademic:0, inaccessibleCourses:0, syllabiFound:1 }
    })
    database.importBrightspace(payload(parseSyllabus({
      courseId:course.id, courseName:course.name, timezone:'America/Indiana/Indianapolis',
      sourceKind:'unknown', text:`Old copied overview\n${'outdated material '.repeat(300)}`
    })))
    const currentText = 'STAT 35000 Fall 2026\nCurrent official Simple Syllabus.'
    database.importBrightspace(payload(parseSyllabus({
      courseId:course.id, courseName:course.name, timezone:'America/Indiana/Indianapolis',
      sourceKind:'simple-syllabus', text:currentText
    })))

    expect(database.getState().syllabi.find((item) => item.courseId === 'brightspace-course-1644209')?.rawText)
      .toBe(currentText)
  })
})

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive:true, force:true })
})

describe('event status persistence', () => {
  it('updates nearby cross-source copies without completing a later recurring event', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-routine-status-'))
    temporaryDirectories.push(directory)
    const database = await DatabaseService.create(path.join(directory, 'test.sqlite'))
    database.saveCourse({
      id:'test-course', code:'TEST 101', name:'Test course', instructor:'', term:'Fall 2026',
      colorKey:'blue', timezone:'America/New_York', notes:''
    })
    const base = {
      courseId:'test-course', title:'Weekly Quiz', type:'quiz', dueTimezone:'America/New_York',
      status:'not_done', sourceType:'manual', sourceLabel:'Test', userEdited:false
    }
    database.saveEvent({ ...base, id:'week-1-a', dueAt:'2026-09-10T21:00:00-04:00' })
    database.saveEvent({ ...base, id:'week-1-b', dueAt:'2026-09-10T23:59:00-04:00' })
    database.saveEvent({ ...base, id:'week-2', dueAt:'2026-09-17T23:59:00-04:00' })

    const state = database.saveEventStatus({ id:'week-1-a', status:'done' })
    const statuses = Object.fromEntries(state.events.filter((event) => event.courseId === 'test-course').map((event) => [event.id,event.status]))
    expect(statuses).toEqual({ 'week-1-a':'done', 'week-1-b':'done', 'week-2':'not_done' })
  })

  it('restores a checked status when Brightspace changes the event id', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-routine-status-id-change-'))
    temporaryDirectories.push(directory)
    const database = await DatabaseService.create(path.join(directory, 'test.sqlite'))
    const course = { id:1644209, code:'STAT 350', name:'Fall 2026 STAT 350', isActive:true, startDate:null, endDate:null }
    const stats = { enrolledCourses:1, currentCourses:1, skippedByAccessWindow:0, skippedNonAcademic:0, inaccessibleCourses:0, syllabiFound:0 }
    const payload = (id: number) => ({
      baseUrl:'https://purdue.brightspace.com', courses:[course], syllabi:[], warnings:[], excludedCourseIds:[], stats,
      items:[{ id, courseId:course.id, title:'Quiz #1', kind:'quiz' as const, dueDate:'2026-09-14T03:59:00.000Z', url:`https://example.test/${id}` }]
    })
    database.importBrightspace(payload(100))
    database.saveEventStatus({ id:'brightspace:quiz:1644209:100', status:'done' })
    database.deleteEvent('brightspace:quiz:1644209:100')

    const state = database.importBrightspace(payload(200)).state

    expect(state.events.find((event) => event.id === 'brightspace:quiz:1644209:200')?.status).toBe('done')
  })
})

describe('weekly planning persistence', () => {
  it('saves, preserves through event edits, and clears only the requested plan', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-routine-plans-'))
    temporaryDirectories.push(directory)
    const database = await DatabaseService.create(path.join(directory, 'test.sqlite'))
    database.saveCourse({
      id:'planning-course', code:'PLAN 101', name:'Planning course', instructor:'', term:'Fall 2026',
      colorKey:'teal', timezone:'America/New_York', notes:''
    })
    const event = {
      id:'planned-event', courseId:'planning-course', title:'Draft paper', type:'assignment',
      dueAt:'2026-09-18T23:59:00-04:00', dueTimezone:'America/New_York', status:'not_done',
      sourceType:'manual', sourceLabel:'Manual', userEdited:true
    }
    database.saveEvent(event)

    let state = database.saveEventPlans({ plans:[{ eventId:event.id, plannedDate:'2026-09-14' }] })
    expect(state.eventPlans).toContainEqual({ eventId:event.id, plannedDate:'2026-09-14' })

    state = database.saveEvent({ ...event, title:'Draft research paper' })
    expect(state.eventPlans).toContainEqual({ eventId:event.id, plannedDate:'2026-09-14' })

    state = database.saveEventPlans({ plans:[{ eventId:event.id, plannedDate:null }] })
    expect(state.eventPlans.find((plan) => plan.eventId === event.id)).toBeUndefined()
  })
})

describe('grade planning persistence', () => {
  it('keeps the detected grading mode, course target, and current-score mode', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-routine-grades-'))
    temporaryDirectories.push(directory)
    const database = await DatabaseService.create(path.join(directory, 'test.sqlite'))
    database.saveCourse({
      id:'score-course', code:'PSY 222', name:'Psychology', instructor:'', term:'Fall 2026',
      colorKey:'rose', timezone:'America/New_York', notes:''
    })

    const state = database.saveGradingItems({
      courseId:'score-course', gradingMode:'points', target:554, items:[
        { id:'exams', courseId:'score-course', label:'Exams', weight:73.17, points:450, targetPoints:405, currentPoints:18, currentMode:'lost' },
        { id:'other', courseId:'score-course', label:'Other work', weight:26.83, points:165, targetPoints:150, currentPoints:120, currentMode:'earned' }
      ]
    })

    expect(state.settings['gradingMode:score-course']).toBe('points')
    expect(state.settings['gradingTarget:score-course']).toBe('554')
    expect(state.gradingItems.filter((item) => item.courseId === 'score-course')).toEqual([
      expect.objectContaining({ id:'exams', weight:73.17, points:450, targetPoints:405, currentPoints:18, currentMode:'lost', userEdited:true }),
      expect.objectContaining({ id:'other', weight:26.83, points:165, targetPoints:150, currentPoints:120, currentMode:'earned', userEdited:true })
    ])
  })

  it('restores syllabus points onto matching legacy percentage rows without losing planner input', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-routine-point-migration-'))
    temporaryDirectories.push(directory)
    const database = await DatabaseService.create(path.join(directory, 'test.sqlite'))
    const course = { id:222, code:'PSY 222', name:'Fall 2026 PSY 222', isActive:true, startDate:null, endDate:null }
    const stats = { enrolledCourses:1, currentCourses:1, skippedByAccessWindow:0, skippedNonAcademic:0, inaccessibleCourses:0, syllabiFound:1 }
    const base = { baseUrl:'https://purdue.brightspace.com', courses:[course], items:[], warnings:[], excludedCourseIds:[], stats }
    database.importBrightspace({ ...base, syllabi:[] })
    database.saveGradingItems({
      courseId:'brightspace-course-222', gradingMode:'percentage', target:90,
      items:[
        { id:'legacy-exams', label:'EXAMS', weight:73.2, points:null, currentPoints:405, currentMode:'earned' },
        { id:'legacy-work', label:'HOMEWORK', weight:26.8, points:null, currentPoints:150, currentMode:'earned' }
      ]
    })
    const syllabus = parseSyllabus({
      courseId:222, courseName:course.name, timezone:'America/Indiana/Indianapolis', sourceKind:'simple-syllabus',
      text:'EXAMS: TOTAL = 450pts\nHOMEWORK: TOTAL = 165pts\nCOURSE GRAND TOTAL = 615 POINTS'
    })

    const state = database.importBrightspace({ ...base, syllabi:[syllabus] }).state

    expect(state.settings['gradingMode:brightspace-course-222']).toBe('points')
    expect(state.gradingItems.filter((item) => item.courseId === 'brightspace-course-222')).toEqual([
      expect.objectContaining({ id:'legacy-exams', points:450, currentPoints:405, userEdited:true }),
      expect.objectContaining({ id:'legacy-work', points:165, currentPoints:150, userEdited:true })
    ])
  })
})

describe('schedule persistence safety', () => {
  it('preserves omitted meetings and deletes only explicitly removed rows', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-routine-schedule-'))
    temporaryDirectories.push(directory)
    const database = await DatabaseService.create(path.join(directory, 'test.sqlite'))
    database.saveCourse({
      id:'schedule-course', code:'SAFE 101', name:'Safe schedule', instructor:'', term:'Fall 2026',
      colorKey:'#456789', timezone:'America/New_York', notes:''
    })
    const meeting = (id: string, dayOfWeek: number, location: string) => ({
      id, courseId:'schedule-course', dayOfWeek, startTime:'09:00', endTime:'09:50',
      location, instructor:'Professor', label:'Lecture', sourceType:'manual'
    })

    database.saveSchedule({ meetings:[meeting('monday', 1, 'Room 1'), meeting('wednesday', 3, 'Room 2')], deletedIds:[] })
    let state = database.saveSchedule({ meetings:[meeting('monday', 1, 'Room 3')], deletedIds:[] })
    expect(state.meetings).toHaveLength(2)
    expect(state.meetings.find((item) => item.id === 'monday')?.location).toBe('Room 3')
    expect(state.meetings.find((item) => item.id === 'wednesday')?.location).toBe('Room 2')

    state = database.saveSchedule({ meetings:[], deletedIds:['wednesday'] })
    expect(state.meetings.map((item) => item.id)).toEqual(['monday'])
  })

  it('starts with an empty database instead of silently inserting demo data', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-routine-empty-'))
    temporaryDirectories.push(directory)
    const database = await DatabaseService.create(path.join(directory, 'test.sqlite'))
    expect(database.getState().courses).toEqual([])
  })

  it('never deletes a local course or its timetable when a later sync omits that course', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-routine-sync-retention-'))
    temporaryDirectories.push(directory)
    const database = await DatabaseService.create(path.join(directory, 'test.sqlite'))
    const stats = { enrolledCourses:1, currentCourses:1, skippedByAccessWindow:0, skippedNonAcademic:0, inaccessibleCourses:0, syllabiFound:0 }
    database.importBrightspace({
      baseUrl:'https://purdue.brightspace.com',
      courses:[{ id:1644209, code:'STAT 350', name:'Fall 2026 STAT 350', isActive:true, startDate:null, endDate:null }],
      items:[], syllabi:[], warnings:[], excludedCourseIds:[], stats
    })
    database.saveSchedule({ meetings:[{
      id:'stat-meeting', courseId:'brightspace-course-1644209', dayOfWeek:1,
      startTime:'09:00', endTime:'09:50', location:'Room 1', instructor:'', label:'Lecture', sourceType:'manual'
    }], deletedIds:[] })

    const result = database.importBrightspace({
      baseUrl:'https://purdue.brightspace.com', courses:[], items:[], syllabi:[],
      warnings:['partial course listing'], excludedCourseIds:[], stats:{ ...stats, currentCourses:0 }
    })

    expect(result.state.courses.map((course) => course.id)).toContain('brightspace-course-1644209')
    expect(result.state.meetings).toContainEqual(expect.objectContaining({ id:'stat-meeting' }))
    expect(result.summary.coursesRemoved).toBe(0)
    expect(fs.readdirSync(path.join(directory, 'backups')).some((name) => name.includes('before-brightspace-sync'))).toBe(true)
  })
})

describe('database recovery safety', () => {
  it('restores a damaged main database from its valid backup instead of creating an empty database', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-routine-recovery-'))
    temporaryDirectories.push(directory)
    const sourcePath = path.join(directory, 'source.sqlite')
    const source = await DatabaseService.create(sourcePath)
    source.saveCourse({
      id:'safe-course', code:'SAFE 101', name:'Recovered course', instructor:'', term:'Fall 2026',
      colorKey:'#123456', timezone:'America/New_York', notes:'keep me'
    })
    const targetPath = path.join(directory, 'target.sqlite')
    fs.copyFileSync(sourcePath, `${targetPath}.bak`)
    fs.writeFileSync(targetPath, 'not a sqlite database')

    const recovered = await DatabaseService.create(targetPath)

    expect(recovered.getState().courses).toContainEqual(expect.objectContaining({ id:'safe-course', colorKey:'#123456' }))
    expect(fs.readdirSync(directory).some((name) => name.startsWith('target.sqlite.corrupt-'))).toBe(true)
  })
})
