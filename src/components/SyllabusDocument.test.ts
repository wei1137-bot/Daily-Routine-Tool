import { describe, expect, it } from 'vitest'
import { parseSyllabusDocument } from './SyllabusDocument'

describe('syllabus document formatting', () => {
  it('removes source chrome and separates recognized themes', () => {
    const sections = parseSyllabusDocument(`menu
Print

MA 351
Fall 2026

Course Information

Meeting Information: SMTH 208

Course Description

Systems of linear equations.

Attendance Policy

Students are expected to attend.`, 'Overview')

    expect(sections.map((section) => section.title)).toEqual(['Overview', 'Course Information', 'Course Description', 'Attendance Policy'])
    expect(sections[0].paragraphs).toEqual(['MA 351 Fall 2026'])
    expect(sections[1].paragraphs).toEqual(['Meeting Information: SMTH 208'])
  })
})
