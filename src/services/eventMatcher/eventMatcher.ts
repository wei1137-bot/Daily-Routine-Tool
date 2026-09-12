import { DateTime } from 'luxon'
import type { AcademicEvent, DetectedEvent } from '../../domain/types'

export function normalizeTitle(title: string) {
  return title.toLowerCase()
    .replace(/\b(hw|h\.w\.)\b/g, 'homework')
    .replace(/\b(lab|quiz|exam|homework)\s*#?0*(\d+)\b/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

function similarity(a: string, b: string) {
  if (a === b) return 1
  const aa = new Set(a.split(' ')); const bb = new Set(b.split(' '))
  const common = [...aa].filter((token) => bb.has(token)).length
  return common / Math.max(aa.size, bb.size, 1)
}

export function findLikelyDuplicate(candidate: DetectedEvent, events: AcademicEvent[]) {
  return events.find((event) => {
    if (!candidate.courseId || event.courseId !== candidate.courseId) return false
    const hours = Math.abs(DateTime.fromISO(event.dueAt).diff(DateTime.fromISO(candidate.dueAt), 'hours').hours)
    return hours <= 2 && similarity(normalizeTitle(event.title), normalizeTitle(candidate.title)) >= 0.6
  })
}
