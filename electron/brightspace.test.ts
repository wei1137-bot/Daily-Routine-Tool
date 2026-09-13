import { describe, expect, it } from 'vitest'
import {
  assignmentCompletionStatus,
  buildPurdueSimpleSyllabusUrl,
  chooseSyllabusSource,
  contentCompletionStatus,
  quizCompletionStatus,
  simpleSyllabusCaptureReady,
  simpleSyllabusTextLooksComplete
} from './brightspace'

describe('Brightspace syllabus source selection', () => {
  it('prefers the course-scoped Simple Syllabus over overview text', () => {
    const selected = chooseSyllabusSource({
      simpleSyllabus: { text: 'current syllabus' },
      overviewSyllabus: { text: 'copied older overview' }
    })

    expect(selected).toEqual({
      source: 'simple-syllabus',
      syllabus: { text: 'current syllabus' }
    })
  })

  it('uses overview text only when Simple Syllabus is unavailable', () => {
    expect(chooseSyllabusSource({ simpleSyllabus: null, overviewSyllabus: 'overview' }))
      .toEqual({ source: 'overview', syllabus: 'overview' })
  })

  it('launches Simple Syllabus with the requested Brightspace course id', () => {
    const url = new URL(buildPurdueSimpleSyllabusUrl('https://purdue.brightspace.com', 1644209))

    expect(url.pathname).toBe('/d2l/common/dialogs/quickLink/quickLink.d2l')
    expect(url.searchParams.get('ou')).toBe('1644209')
    expect(url.searchParams.get('type')).toBe('lti')
    expect(url.searchParams.get('rcode')).toBe('354644E0-4CD8-419D-A32F-4E78D8778E5C-12707056')
    expect(url.searchParams.get('framedName')).toBe('Syllabus')
  })

  it('does not accept a stable-looking partial page before a complete scroll pass', () => {
    expect(simpleSyllabusCaptureReady({
      firstReadableAt: 1_000,
      lastGrowthAt: 2_000,
      observedAt: 12_000,
      completedPasses: 0,
      loading: false
    })).toBe(false)
  })

  it('accepts a stable document after a complete incremental scroll pass', () => {
    expect(simpleSyllabusCaptureReady({
      firstReadableAt: 1_000,
      lastGrowthAt: 8_000,
      observedAt: 12_000,
      completedPasses: 1,
      loading: false
    })).toBe(true)
  })

  it('distinguishes a navigation shell from a complete syllabus document', () => {
    const navigation = `Course Information
Course Description
Course Learning Outcomes
Attendance Policy
Course Schedule
Late Work
Absences
Academic Integrity
Course Evaluation`
    const complete = `${navigation}
Course Information
This section contains detailed meeting information for every student enrolled in the course.
Course Description
This course introduces systems programming, memory management, concurrency, and secure software development practices.
Attendance Policy
Students are expected to attend lectures and participate in the scheduled laboratory meetings each week.
Academic Integrity
All submitted programs must be the student's own work and follow the university academic integrity policy.`

    expect(simpleSyllabusTextLooksComplete(navigation)).toBe(false)
    expect(simpleSyllabusTextLooksComplete(complete)).toBe(true)
  })
})

describe('Brightspace completion status parsing', () => {
  it('distinguishes submitted and unsubmitted assignment folders', () => {
    expect(assignmentCompletionStatus([])).toBe('incomplete')
    expect(assignmentCompletionStatus([{ Submissions:[{ Id:12 }] }])).toBe('complete')
    expect(assignmentCompletionStatus({ Objects:[] })).toBe('unknown')
  })

  it('only treats a completed attempt for the current learner as a completed quiz', () => {
    expect(quizCompletionStatus({ Objects:[] }, 42)).toBe('incomplete')
    expect(quizCompletionStatus({ Objects:[{ UserId:42, Completed:null }] }, 42)).toBe('incomplete')
    expect(quizCompletionStatus({ Objects:[{ UserId:42, Completed:'2026-09-10T12:00:00Z' }] }, 42)).toBe('complete')
    expect(quizCompletionStatus({ Items: null }, 42)).toBe('unknown')
  })

  it('reads content-topic completion without guessing from another learner', () => {
    expect(contentCompletionStatus({ UserId:42, CompletionDate:null }, 42)).toBe('incomplete')
    expect(contentCompletionStatus({ UserId:42, CompletionDate:'2026-09-10T12:00:00Z' }, 42)).toBe('complete')
    expect(contentCompletionStatus({ UserId:99, CompletionDate:'2026-09-10T12:00:00Z' }, 42)).toBe('unknown')
  })
})
