import { describe, expect, it } from 'vitest'
import type { CourseMeeting } from '../domain/types'
import { createMeetingDraft, groupMeetingsForEditor, mergeMeetings } from './SchedulePage'

const meeting = (id: string, dayOfWeek: number, startTime = '09:00'): CourseMeeting => ({
  id, courseId:'course', dayOfWeek, startTime, endTime:'09:50', location:'', instructor:'', label:'Lecture', sourceType:'manual'
})

describe('schedule draft merging', () => {
  it('starts an edit from every saved meeting without sharing mutable objects', () => {
    const existing = [meeting('existing-monday', 1), meeting('existing-wednesday', 3)]
    const draft = createMeetingDraft(existing)

    expect(draft).toEqual(existing)
    expect(draft).not.toBe(existing)
    expect(draft[0]).not.toBe(existing[0])
  })

  it('keeps existing meetings, adds new recognition results, and ignores matching slots', () => {
    const existing = [meeting('existing-monday', 1), meeting('existing-wednesday', 3)]
    const result = mergeMeetings(existing, [meeting('duplicate', 1), meeting('new-friday', 5)])
    expect(result.map((item) => item.id)).toEqual(['existing-monday', 'existing-wednesday', 'new-friday'])
  })

  it('groups matching course and time slots into one editor row with multiple weekdays', () => {
    const meetings = [meeting('monday',1), meeting('wednesday',3), meeting('friday',5), meeting('later',2,'10:00')]
    const groups = groupMeetingsForEditor(meetings)

    expect(groups).toHaveLength(2)
    expect(groups[0].days).toEqual([1,3,5])
    expect(groups[0].meetings.map((item) => item.id)).toEqual(['monday','wednesday','friday'])
  })
})
