import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import { canonicalEventTitle, defaultEventDueAt, eventDateTime, groupForDate, mergeDuplicateEvents, sortEvents } from './eventUtils'
import type { AcademicEvent } from '../types'

const event = (id: string, dueAt: string) => ({ id, dueAt } as AcademicEvent)

describe('event utilities', () => {
  it('sorts events chronologically regardless of input order', () => {
    expect(sortEvents([event('late','2026-09-12T10:00:00-04:00'), event('early','2026-09-09T23:00:00-04:00')]).map((e) => e.id)).toEqual(['early','late'])
  })

  it('groups by the course timezone rather than the machine timezone', () => {
    const reference = DateTime.fromISO('2026-09-09T23:30:00-04:00')
    expect(groupForDate('2026-09-10T00:15:00-04:00', 'America/New_York', reference)).toBe('Tomorrow')
    expect(groupForDate('2026-09-10T00:15:00-04:00', 'America/Los_Angeles', reference)).toBe('Today')
  })

  it('normalizes Brightspace calendar suffixes for cross-source matching', () => {
    expect(canonicalEventTitle('Take-home quiz 2 submission - Due')).toBe(canonicalEventTitle('Take-home quiz 2'))
    expect(canonicalEventTitle('Take-home quiz 2 template - Due')).toBe(canonicalEventTitle('Take-home quiz 2'))
  })

  it('keeps one event at the later deadline and records both source times', () => {
    const base = { courseId: 'cs240', title: 'Lab 3', dueTimezone: 'America/New_York', status: 'not_done', type: 'lab' } as const
    const merged = mergeDuplicateEvents([
      { ...base, id: 'brightspace', dueAt: '2026-09-11T21:00:00-04:00', sourceType: 'brightspace_api', sourceLabel: 'Brightspace' },
      { ...base, id: 'gradescope', dueAt: '2026-09-11T23:59:00-04:00', sourceType: 'gradescope', sourceLabel: 'Gradescope' }
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('gradescope')
    expect(merged[0].sourceDueTimes).toHaveLength(2)
  })

  it('collapses equal deadlines without changing the due time', () => {
    const merged = mergeDuplicateEvents([
      { ...event('b', '2026-09-10T23:59:00-04:00'), courseId: 'cs240', title: 'Quiz 2 - Due', dueTimezone: 'America/New_York', status: 'not_done', type: 'quiz', sourceType: 'brightspace_api' },
      { ...event('g', '2026-09-10T23:59:00-04:00'), courseId: 'cs240', title: 'Quiz 2', dueTimezone: 'America/New_York', status: 'not_done', type: 'quiz', sourceType: 'gradescope' }
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].dueAt).toBe('2026-09-10T23:59:00-04:00')
  })

  it('keeps a completed duplicate completed when another source reports not done', () => {
    const merged = mergeDuplicateEvents([
      { ...event('brightspace', '2026-09-10T23:59:00-04:00'), courseId: 'cs240', title: 'Take-home quiz 2 template', dueTimezone: 'America/New_York', status: 'not_done', type: 'quiz', sourceType: 'brightspace_api' },
      { ...event('gradescope', '2026-09-10T23:59:00-04:00'), courseId: 'cs240', title: 'Take-home quiz 2', dueTimezone: 'America/New_York', status: 'done', type: 'assignment', sourceType: 'gradescope' }
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].status).toBe('done')
  })

  it('prefers the most recent local status when sources disagree', () => {
    const merged = mergeDuplicateEvents([
      { ...event('local', '2026-09-10T23:59:00-04:00'), courseId: 'cs240', title: 'Quiz 2', dueTimezone: 'America/New_York', status: 'not_done', type: 'quiz', sourceType: 'brightspace_api', userEdited: true, updatedAt: '2026-09-11T01:00:00Z' },
      { ...event('submitted', '2026-09-10T23:59:00-04:00'), courseId: 'cs240', title: 'Quiz 2', dueTimezone: 'America/New_York', status: 'done', type: 'assignment', sourceType: 'gradescope', updatedAt: '2026-09-11T00:00:00Z' }
    ])
    expect(merged[0].status).toBe('not_done')
  })

  it('does not collapse recurring events that reuse the same title', () => {
    const base = { courseId: 'cs240', title: 'Weekly Quiz', dueTimezone: 'America/New_York', status: 'not_done', type: 'quiz', sourceType: 'brightspace_api' } as const
    const merged = mergeDuplicateEvents([
      { ...base, id: 'week-1', dueAt: '2026-09-10T23:59:00-04:00' },
      { ...base, id: 'week-2', dueAt: '2026-09-17T23:59:00-04:00' }
    ])
    expect(merged).toHaveLength(2)
  })

  it('formats event times in the requested course timezone', () => {
    const due = '2026-09-18T19:30:00-04:00'
    expect(eventDateTime(due, 'America/Indiana/Indianapolis').toFormat('yyyy-MM-dd HH:mm')).toBe('2026-09-18 19:30')
    expect(eventDateTime(due, 'Asia/Shanghai').toFormat('yyyy-MM-dd HH:mm')).toBe('2026-09-19 07:30')
  })

  it('creates the default due time one local day later without reinterpreting UTC wall time', () => {
    const reference = DateTime.fromISO('2026-09-11T09:00:00Z', { setZone: true })
    expect(eventDateTime(defaultEventDueAt('America/Indiana/Indianapolis', reference), 'America/Indiana/Indianapolis').toFormat("yyyy-MM-dd'T'HH:mm"))
      .toBe('2026-09-12T05:00')
  })
})
