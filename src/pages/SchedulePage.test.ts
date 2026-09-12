import { describe, expect, it } from 'vitest'
import type { CourseMeeting } from '../domain/types'
import { mergeMeetings } from './SchedulePage'

const meeting = (id: string, dayOfWeek: number, startTime = '09:00'): CourseMeeting => ({
  id, courseId:'course', dayOfWeek, startTime, endTime:'09:50', location:'', instructor:'', label:'Lecture', sourceType:'manual'
})

describe('schedule draft merging', () => {
  it('keeps existing meetings, adds new recognition results, and ignores matching slots', () => {
    const existing = [meeting('existing-monday', 1), meeting('existing-wednesday', 3)]
    const result = mergeMeetings(existing, [meeting('duplicate', 1), meeting('new-friday', 5)])
    expect(result.map((item) => item.id)).toEqual(['existing-monday', 'existing-wednesday', 'new-friday'])
  })
})
