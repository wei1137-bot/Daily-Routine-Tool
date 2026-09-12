import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseService } from './database'

const temporaryDirectories: string[] = []

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
  it('keeps percentage and points data together with the selected current-score mode', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-routine-grades-'))
    temporaryDirectories.push(directory)
    const database = await DatabaseService.create(path.join(directory, 'test.sqlite'))
    database.saveCourse({
      id:'score-course', code:'PSY 222', name:'Psychology', instructor:'', term:'Fall 2026',
      colorKey:'rose', timezone:'America/New_York', notes:''
    })

    const state = database.saveGradingItems({
      courseId:'score-course', displayMode:'points', items:[
        { id:'exams', courseId:'score-course', label:'Exams', weight:73.17, points:450, targetPoints:405, currentPoints:18, currentMode:'lost' },
        { id:'other', courseId:'score-course', label:'Other work', weight:26.83, points:165, targetPoints:150, currentPoints:120, currentMode:'earned' }
      ]
    })

    expect(state.settings['gradingDisplayMode:score-course']).toBe('points')
    expect(state.gradingItems.filter((item) => item.courseId === 'score-course')).toEqual([
      expect.objectContaining({ id:'exams', weight:73.17, points:450, targetPoints:405, currentPoints:18, currentMode:'lost', userEdited:true }),
      expect.objectContaining({ id:'other', weight:26.83, points:165, targetPoints:150, currentPoints:120, currentMode:'earned', userEdited:true })
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
})
