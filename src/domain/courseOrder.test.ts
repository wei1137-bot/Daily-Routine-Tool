import { describe, expect, it } from 'vitest'
import type { Course } from './types'
import { applyCourseOrder, moveCourseTo } from './courseOrder'

const courses = ['cs','eaps','ma'].map((id) => ({ id, code:id.toUpperCase() } as Course))

describe('course order', () => {
  it('applies a saved order and appends newly imported courses', () => {
    expect(applyCourseOrder(courses, JSON.stringify(['ma','cs'])).map((course) => course.id)).toEqual(['ma','cs','eaps'])
  })

  it('falls back safely when the saved setting is invalid', () => {
    expect(applyCourseOrder(courses, 'not-json')).toEqual(courses)
  })

  it('moves a course to the hovered position in either direction', () => {
    expect(moveCourseTo(courses, 'cs', 'ma').map((course) => course.id)).toEqual(['eaps','ma','cs'])
    expect(moveCourseTo(courses, 'ma', 'cs').map((course) => course.id)).toEqual(['ma','cs','eaps'])
  })
})
