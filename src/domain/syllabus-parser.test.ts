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

  it('binds attendance decisions to exact source phrases', () => {
    const text = `Attendance Policy
This section is fully asynchronous. There are no class meetings and no attendance is taken. The exams are the exception: both midterms are held in person and attendance at them is required.
Course Schedule`
    const parsed = parseSyllabus({
      courseId:350, courseName:'STAT 350', timezone:'America/Indiana/Indianapolis',
      sourceKind:'simple-syllabus-v2', text
    })
    const evidence = parsed.fieldResults.attendancePolicy

    expect(evidence.type).toBe('mixed')
    expect(evidence.sources).toHaveLength(1)
    expect(evidence.sources[0]).toMatchObject({ section:'Attendance Policy', page:null })
    expect(evidence.sources[0].text).toContain('no attendance is taken')
    expect(evidence.sources[0].highlights.map((range) => evidence.sources[0].text.slice(range.start, range.end)))
      .toEqual(['no attendance is taken', 'both midterms are held in person and attendance at them is required'])
  })

  it('keeps separate late-policy evidence blocks and PDF page numbers', () => {
    const page = `Homework Assignments
Homeworks completed late will be marked with 1 point off for each day late.
Movies and Movie Worksheets
Late movie worksheets will be marked with 1 point off for each day late.
Course Schedule`
    const parsed = parseSyllabus({
      courseId:106, courseName:'EAPS 106', timezone:'America/Indiana/Indianapolis',
      sourceKind:'overview-attachment', text:page, pages:[{ page:7, text:page }]
    })
    const sources = parsed.fieldResults.latePolicy.sources

    expect(sources.map((source) => source.section)).toEqual(['Homework Assignments', 'Movies and Movie Worksheets'])
    expect(sources.every((source) => source.page === 7)).toBe(true)
    for (const source of sources) {
      for (const range of source.highlights) {
        expect(range.start).toBeGreaterThanOrEqual(0)
        expect(range.end).toBeLessThanOrEqual(source.text.length)
        expect(source.text.slice(range.start, range.end)).toMatch(/1 point off for each day late/i)
      }
    }
  })

  it('preserves suspicious source text exactly and does not fabricate evidence', () => {
    const office = `Student Consultation Hours
Monday & Wednesday 11:45 pm - 1:15 pm at MATH 416
Course Description
Linear algebra.`
    const parsed = parseSyllabus({
      courseId:351, courseName:'MA 351', timezone:'America/Indiana/Indianapolis',
      sourceKind:'overview-attachment', text:office, pages:[{ page:1, text:office }]
    })
    expect(parsed.fieldResults.officeHours.sources[0]).toMatchObject({
      section:'Student Consultation Hours', page:1
    })
    expect(parsed.fieldResults.officeHours.sources[0].text).toContain('11:45 pm')

    const unmatched = parseSyllabus({
      courseId:1, courseName:'TEST 1', timezone:'UTC',
      text:'Course Syllabus: grading, exam dates, attendance, academic integrity, and the AI policy.'
    })
    expect(unmatched.fieldResults.attendancePolicy.sources).toEqual([])
  })

  it('keeps policy card displays concise while retaining the full supporting source', () => {
    const attendance = `Attendance Policy
This course follows the University Academic Regulations regarding class attendance, which state that students are expected to be present for every meeting. When conflicts or absences can be anticipated, students should notify the instructor as far in advance as possible. Additional exception procedures and documentation requirements continue for several more paragraphs.
Late Work
We allow late submissions for homework assignments with a penalty of 10% per day late with a 48 hour maximum. There is an initial grace period of six hours where a reduced 2% penalty applies. Additional absence procedures continue for several more paragraphs.`
    const parsed = parseSyllabus({
      courseId:240, courseName:'CS 240', timezone:'America/Indiana/Indianapolis', text:attendance
    })

    expect(parsed.attendancePolicy.length).toBeLessThanOrEqual(261)
    expect(parsed.latePolicy.length).toBeLessThanOrEqual(261)
    expect(parsed.fieldResults.attendancePolicy.sources[0].text).toContain('expected to be present')
    expect(parsed.fieldResults.latePolicy.sources[0].text).toContain('10% per day late')
  })

  it('prefers the actual attendance section over a similar learning-outcome sentence', () => {
    const parsed = parseSyllabus({
      courseId:240, courseName:'CS 240', timezone:'America/Indiana/Indianapolis',
      text:`Course Learning Outcomes
You are expected to attend lectures barring an emergency.
Attendance Policy
This is a face-to-face course. It is in your best interest to attend all lectures and labs.
Course Schedule`
    })
    expect(parsed.fieldResults.attendancePolicy.sources.map((source) => source.section)).toEqual(['Attendance Policy'])
  })

  it('keeps evidence inside its recognized section instead of pulling in the preceding section', () => {
    const parsed = parseSyllabus({
      courseId:350, courseName:'STAT 350', timezone:'America/Indiana/Indianapolis',
      text:`Additional Information
Office: MATH 210
Course Description
Credit Hours: 3.00. This course provides a data-oriented introduction to applied statistics, covering probability and inference.
Attendance Policy
There are no class meetings and no attendance is taken. Both midterms are held in person and attendance at them is required.`
    })

    const descriptionSource = parsed.fieldResults.rawSummary.sources[0]
    expect(descriptionSource.section).toBe('Course Description')
    expect(descriptionSource.text).not.toContain('Additional Information')
    expect(descriptionSource.text).not.toContain('Office: MATH 210')
    expect(parsed.attendancePolicy).toBe('No regular attendance is taken; both in-person midterms require attendance.')
  })

  it('ignores a repeated table of contents and reads the later syllabus sections', () => {
    const parsed = parseSyllabus({
      courseId:240, courseName:'CS 240', timezone:'America/Indiana/Indianapolis',
      sourceKind:'simple-syllabus-v2',
      text:`Course Information
Instructor(s) Contact Information
Course Description
Course Learning Outcomes
Attendance Policy
Course Schedule
Late Work
Absences
Academic Integrity
Course Information
Meeting Information: BHEE 129
Instructor(s) Contact Information
Name: Ada Lovelace
Student Consultation Hours
Appointment by eMail
Course Description
Credit Hours: 3. The UNIX environment, C development cycle, pointers, and dynamic memory allocation.
Course Learning Outcomes
Write maintainable C programs.
Attendance Policy
It is in your best interest to attend all lectures and labs.
Course Schedule
Weekly topics are posted in Brightspace.
Late Work
We allow late submissions with a penalty of 10% per day late with a 48 hour maximum. There is an initial grace period of six hours where a reduced 2% penalty applies.
Absences
Official documentation is required.
Academic Integrity
Submit your own work.`
    })

    expect(parsed.rawSummary).toContain('UNIX environment')
    expect(parsed.attendancePolicy).toContain('best interest to attend')
    expect(parsed.latePolicy).toContain('10% per day late')
    expect(parsed.latePolicy).not.toBe('Absences')
  })
})
