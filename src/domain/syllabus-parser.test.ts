import { describe, expect, it } from 'vitest'
import { parseSyllabus } from '../../electron/syllabus-parser'

describe('syllabus parser', () => {
  it('recognizes numbered, aliased, and inline syllabus sections', () => {
    const parsed = parseSyllabus({
      courseId: 240,
      courseName: 'Fall 2026 CS 240',
      timezone: 'America/Indiana/Indianapolis',
      text: `
        1. Course Overview: Learn systems programming, memory, and concurrency.
        2. Instructor Information
        Instructor Name: Dr. Ada Lovelace
        Email: ada@example.edu
        3. Student Hours — Monday and Wednesday 2:00 PM-4:00 PM
        4. Class Attendance
        Students are expected to attend every lecture. Notify the instructor before an absence.
        5. Late/Missed Work Policy
        Late assignments lose 10% for each day after the deadline.
        6. Grading
        Homework: 40%
        Exams: 60%
      `
    })

    expect(parsed.rawSummary).toContain('systems programming')
    expect(parsed.instructor).toBe('Dr. Ada Lovelace')
    expect(parsed.officeHours).toContain('Monday and Wednesday')
    expect(parsed.attendancePolicy).toContain('expected to attend')
    expect(parsed.latePolicy).toContain('lose 10%')
  })

  it('falls back to policy sentences when a document has no clean headings', () => {
    const parsed = parseSyllabus({
      courseId: 222,
      courseName: 'Fall 2026 PSY 222',
      timezone: 'America/Indiana/Indianapolis',
      text: `Professor Grace Hopper teaches this course.

      Students are expected to maintain regular attendance and contact the instructor about an absence.

      Work submitted late receives a penalty of five points per day.`
    })

    expect(parsed.instructor).toBe('Grace Hopper')
    expect(parsed.attendancePolicy).toContain('regular attendance')
    expect(parsed.latePolicy).toContain('submitted late')
  })

  it('does not mistake a syllabus navigation description for an attendance policy', () => {
    const parsed = parseSyllabus({
      courseId: 350,
      courseName: 'Fall 2026 STAT 350',
      timezone: 'America/Indiana/Indianapolis',
      text: `Course Homepage: every required material and how to navigate the course.
      Course Syllabus: grading, exam dates, attendance, academic integrity, and the AI policy.
      You are responsible for reading every linked page.`
    })

    expect(parsed.attendancePolicy).toBe('')
  })
})
