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
    expect(parsed.gradingItems).toEqual([
      expect.objectContaining({ label:'Homework', weight:40, points:null }),
      expect.objectContaining({ label:'Exams', weight:60, points:null })
    ])
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

  it('keeps point-based grading as points instead of converting it to percentages', () => {
    const parsed = parseSyllabus({
      courseId:222,
      courseName:'Fall 2026 PSY 222',
      timezone:'America/Indiana/Indianapolis',
      text:`COURSE GRAND TOTAL = 615* POINTS
      EXAMS (MODULE ASSESSMENT): TOTAL = 450pts
      EXAM 1 (MODULE #1) = 100 PTS
      CUMULATIVE FINAL EXAM: TOTAL = 150PTS
      HOMEWORK/IN-CLASS Assignments/attendance (ICA) etc: TOTAL = 65pts
      ONLINE DISCUSSION POST/RESPONSES (4x20): TOTAL = 80 pts
      APPLICATION: FINAL JOURNAL Discussion-Reflection: TOTAL = 20pts`
    })

    expect(parsed.gradingItems).toEqual([
      expect.objectContaining({ label:'EXAMS', weight:0, points:450 }),
      expect.objectContaining({ label:'HOMEWORK/IN-CLASS Assignments/Attendance (ICA) Etc', weight:0, points:65 }),
      expect.objectContaining({ label:'ONLINE DISCUSSION POST/RESPONSES', weight:0, points:80 }),
      expect.objectContaining({ label:'APPLICATION: FINAL JOURNAL Discussion-Reflection', weight:0, points:20 })
    ])
    expect(parsed.gradingItems.reduce((sum, item) => sum + Number(item.points), 0)).toBe(615)
  })

  it('recognizes split-line category weights and expands repeated categories', () => {
    const parsed = parseSyllabus({
      courseId:240,
      courseName:'Fall 2026 CS 24000 - PWL - Merge',
      timezone:'America/Indiana/Indianapolis',
      text:`Grades and Grade Reports
      Homeworks, Labs, and Quizzes (HLQ)
      50%
      Homeworks & style grades
      35%
      Lab exercises
      10%
      Take-home quizzes
      2%
      In-class quizzes
      3%
      Exams
      50%
      Two midterms
      14% each
      Final exam
      22%
      Attendance Policy`
    })

    expect(parsed.gradingItems.map(({ label, weight }) => ({ label, weight }))).toEqual([
      { label:'Homeworks & Style Grades', weight:35 },
      { label:'Lab Exercises', weight:10 },
      { label:'Take-Home Quizzes', weight:2 },
      { label:'In-Class Quizzes', weight:3 },
      { label:'Midterm 1', weight:14 },
      { label:'Midterm 2', weight:14 },
      { label:'Final Exam', weight:22 }
    ])
    expect(parsed.gradingItems.reduce((sum, item) => sum + item.weight, 0)).toBe(100)
  })

  it('excludes a percentage total row and extracts the formal syllabus title', () => {
    const parsed = parseSyllabus({
      courseId:351,
      courseName:'Fall 2026 MA 35100 - Merge',
      timezone:'America/Indiana/Indianapolis',
      sourceKind:'simple-syllabus-v2',
      text:`MA (WL) 35100 011 - Elem Linear Algebra
      Grades and Grade Reports
      Brightspace quizzes 8%
      Homework, including computer assignments 24%
      Midterm Exam 1 20%
      Midterm Exam 2 20%
      Final Exam (comprehensive) 28%
      Total 100%
      Course evaluation (bonus) +1%
      Attendance Policy`
    })

    expect(parsed.courseTitle).toBe('Elementary Linear Algebra')
    expect(parsed.gradingItems.map(({ label, weight }) => ({ label, weight }))).toEqual([
      { label:'Brightspace Quizzes', weight:8 },
      { label:'Homework, Including Computer Assignments', weight:24 },
      { label:'Midterm Exam 1', weight:20 },
      { label:'Midterm Exam 2', weight:20 },
      { label:'Final Exam', weight:28 }
    ])
    expect(parsed.gradingItems.reduce((sum, item) => sum + item.weight, 0)).toBe(100)
  })

  it('extracts titles from alphanumeric and comma-separated section headers', () => {
    const cs = parseSyllabus({
      courseId:240, courseName:'Fall 2026 CS 24000 - PWL - Merge', timezone:'America/Indiana/Indianapolis',
      sourceKind:'simple-syllabus-v2', text:'CS (WL) 24000 LE1 - Programming In C\nCourse Information'
    })
    const eaps = parseSyllabus({
      courseId:106, courseName:'Fall 2026 EAPS 10600 - Merge', timezone:'America/Indiana/Indianapolis',
      sourceKind:'overview-attachment', text:'1\nEAPS 106-002, 3, Geosciences in the Cinema\nFall 2026'
    })

    expect(cs.courseTitle).toBe('Programming in C')
    expect(eaps.courseTitle).toBe('Geosciences in the Cinema')
  })
})
