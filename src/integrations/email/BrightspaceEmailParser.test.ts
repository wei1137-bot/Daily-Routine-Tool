import { describe, expect, it } from 'vitest'
import { BrightspaceEmailParser } from './BrightspaceEmailParser'

describe('BrightspaceEmailParser', () => {
  it('extracts the sample course, title, type, and timezone-safe due date', () => {
    const input = `Activity summary for Fall 2026 STAT 350 Online Section - Merge

Quiz #1 - Due date is in 1 day

Due date:
Friday, September 4, 2026 11:59 PM EDT`
    const [result] = new BrightspaceEmailParser().parse(input)
    expect(result.courseCode).toBe('STAT 350')
    expect(result.title).toBe('Quiz #1')
    expect(result.type).toBe('quiz')
    expect(result.dueAt).toBe('2026-09-04T23:59:00.000-04:00')
    expect(result.sourceLabel).toBe('Brightspace Email')
  })

  it('does not claim unsupported messages', () => {
    expect(new BrightspaceEmailParser().parse('Lunch tomorrow')).toEqual([])
  })
})
