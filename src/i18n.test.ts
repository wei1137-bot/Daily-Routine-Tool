import { describe, expect, it } from 'vitest'
import { localizedCourseName } from './i18n'

describe('localizedCourseName', () => {
  it('keeps the stored course name in English', () => {
    expect(localizedCourseName('en', 'Programming in C')).toBe('Programming in C')
  })

  it.each([
    ['Programming in C', 'C 语言编程'],
    ['Geosciences in the Cinema', '电影中的地球科学'],
    ['Elementary Linear Algebra', '初等线性代数'],
    ['Intro Discrete Math', '离散数学导论'],
    ['Intro Behvr Neurosci', '行为神经科学导论'],
    ['Intro To Statistics', '统计学导论']
  ])('shows the Chinese name for %s', (storedName, expectedName) => {
    expect(localizedCourseName('zh', storedName)).toBe(expectedName)
  })

  it('keeps an unknown course name unchanged', () => {
    expect(localizedCourseName('zh', 'Special Topics in Computing')).toBe('Special Topics in Computing')
  })
})
