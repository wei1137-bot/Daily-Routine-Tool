const TERM_WORDS = new Set(['SPRING', 'SUMMER', 'FALL', 'WINTER'])

export function academicCourseCode(...values: string[]) {
  for (const value of values) {
    const matches = value.toUpperCase().matchAll(/(?:^|[^A-Z])([A-Z]{2,5})[\s._()/-]*(\d{3,5})(?=[^0-9]|$)/g)
    for (const match of matches) {
      if (TERM_WORDS.has(match[1])) continue
      const digits = match[2].length === 5 && match[2].endsWith('00') ? match[2].slice(0, 3) : match[2]
      return `${match[1]} ${digits}`
    }
  }
  return null
}

export function normalizeCourseCode(value: string) {
  return academicCourseCode(value)?.replace(/\s/g, '') ?? value.replace(/[^A-Z0-9]/gi, '').toUpperCase()
}

export function normalizedCourseName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}
