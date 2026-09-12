import { describe, expect, it } from 'vitest'
import { findLikelyDuplicate, normalizeTitle } from './eventMatcher'
import type { AcademicEvent, DetectedEvent } from '../../domain/types'

describe('event matcher', () => {
  it('normalizes common homework abbreviations', () => {
    expect(normalizeTitle('HW #03')).toBe('homework 3')
  })

  it('matches a similar event in the same course and near the same time', () => {
    const existing = { id:'e1', courseId:'ma351', title:'Homework 3', dueAt:'2026-09-10T23:59:00-04:00' } as AcademicEvent
    const candidate = { courseId:'ma351', title:'HW #3', dueAt:'2026-09-10T23:30:00-04:00' } as DetectedEvent
    expect(findLikelyDuplicate(candidate, [existing])?.id).toBe('e1')
  })

  it('does not merge similar titles from different courses', () => {
    const existing = { id:'e1', courseId:'ma351', title:'Homework 3', dueAt:'2026-09-10T23:59:00-04:00' } as AcademicEvent
    const candidate = { courseId:'cs240', title:'Homework 3', dueAt:'2026-09-10T23:59:00-04:00' } as DetectedEvent
    expect(findLikelyDuplicate(candidate, [existing])).toBeUndefined()
  })
})
