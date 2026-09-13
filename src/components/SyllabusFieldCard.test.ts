import { describe, expect, it } from 'vitest'
import { highlightedRangesForSource } from './SyllabusFieldCard'

describe('syllabus evidence highlighting', () => {
  it('keeps valid original ranges and maps unchanged phrases into a correction', () => {
    const source = {
      section:'Attendance Policy', page:9,
      text:'No meetings; no attendance is taken.',
      correctedText:'No regular meetings; no attendance is taken.',
      highlights:[{ start:13, end:35 }]
    }
    const corrected = highlightedRangesForSource(source)
    expect(corrected).toEqual([{ start:21, end:43 }])
    expect(source.correctedText.slice(corrected[0].start, corrected[0].end)).toBe('no attendance is taken')
    expect(highlightedRangesForSource(source, true)).toEqual([{ start:13, end:35 }])
  })

  it('drops invalid or no-longer-present highlights instead of inventing new ones', () => {
    expect(highlightedRangesForSource({
      section:'Late Work', page:null, text:'Late work is not accepted.', correctedText:'Ask the instructor.',
      highlights:[{ start:-1, end:4 }, { start:0, end:25 }, { start:50, end:60 }]
    })).toEqual([])
  })
})
