import type { Course } from './types'

export function applyCourseOrder(courses: Course[], storedOrder?: string) {
  const courseById = new Map(courses.map((course) => [course.id, course]))
  let orderedIds: string[] = []
  try {
    const parsed = storedOrder ? JSON.parse(storedOrder) : []
    if (Array.isArray(parsed)) orderedIds = parsed.filter((id): id is string => typeof id === 'string')
  } catch {
    // Invalid or legacy settings fall back to the database order.
  }
  const seen = new Set<string>()
  const ordered = orderedIds.flatMap((id) => {
    const course = courseById.get(id)
    if (!course || seen.has(id)) return []
    seen.add(id)
    return [course]
  })
  return [...ordered, ...courses.filter((course) => !seen.has(course.id))]
}

export function moveCourseTo(courses: Course[], sourceId: string, targetId: string) {
  const sourceIndex = courses.findIndex((course) => course.id === sourceId)
  const targetIndex = courses.findIndex((course) => course.id === targetId)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return courses
  const next = [...courses]
  const [source] = next.splice(sourceIndex, 1)
  const insertionIndex = sourceIndex < targetIndex ? targetIndex : targetIndex
  next.splice(insertionIndex, 0, source)
  return next
}
