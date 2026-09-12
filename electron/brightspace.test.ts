import { describe, expect, it } from 'vitest'
import { buildPurdueSimpleSyllabusUrl, chooseSyllabusSource } from './brightspace'

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
})
