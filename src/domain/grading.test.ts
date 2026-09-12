import { describe, expect, it } from 'vitest'

import type { GradingItem } from './types'
import { gradeAThresholdPercent, gradeContribution, gradingModeFor, projectedGrade } from './grading'

const item = (value: Partial<GradingItem>): GradingItem => ({
  id:'grade', courseId:'course', label:'Final', weight:25, ...value
})

describe('grade planning calculations', () => {
  it('detects the grading mode from syllabus values', () => {
    expect(gradingModeFor([item({ weight:25, points:null })])).toBe('percentage')
    expect(gradingModeFor([item({ weight:0, points:450 })])).toBe('points')
  })

  it('calculates weighted percentage contributions', () => {
    expect(gradeContribution(item({ currentPoints:90, currentMode:'earned' }), 'percentage')).toEqual({ earned:90, contribution:22.5 })
    expect(gradeContribution(item({ currentPoints:10, currentMode:'lost' }), 'percentage')).toEqual({ earned:90, contribution:22.5 })
  })

  it('calculates point totals and treats an empty lost-score field as zero lost', () => {
    const grades = [
      item({ id:'exam', weight:0, points:450, currentPoints:45, currentMode:'lost' }),
      item({ id:'work', weight:0, points:165, currentPoints:150, currentMode:'earned' })
    ]
    expect(projectedGrade(grades, 'points')).toEqual({ complete:true, hasScores:true, value:555 })
    expect(gradeContribution(item({ points:100, currentPoints:null, currentMode:'lost' }), 'points')).toEqual({ earned:100, contribution:100 })
    expect(projectedGrade([...grades, item({ id:'blank', weight:0, points:100, currentPoints:null, currentMode:'lost' })], 'points')).toEqual({ complete:true, hasScores:true, value:655 })
  })

  it('reads the A threshold from common syllabus grading-scale formats', () => {
    expect(gradeAThresholdPercent('A ≥ 93% (744 points)\nA- ≥ 90%')).toBe(93)
    expect(gradeAThresholdPercent('Grade Overall Average\nA\n≥ 90%\nB\n≥ 80%')).toBe(90)
    expect(gradeAThresholdPercent('A+\n98-100%\nA\n94-97%\nA-\n90-93%')).toBe(94)
    expect(gradeAThresholdPercent('Students who earn at least 97% are guaranteed an A+, 93% guarantees an A, 90% an A-.')).toBe(93)
    expect(gradeAThresholdPercent('Approximate cutoffs: 90 and above is the A range, 80–89 the B range.')).toBe(90)
  })
})
