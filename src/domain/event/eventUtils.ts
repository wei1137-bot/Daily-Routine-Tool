import { DateTime } from 'luxon'
import type { AcademicEvent } from '../types'

export function sortEvents(events: AcademicEvent[]) {
  return [...events].sort((a, b) => DateTime.fromISO(a.dueAt).toMillis() - DateTime.fromISO(b.dueAt).toMillis())
}

export function canonicalEventTitle(value: string) {
  let title = value.trim()
  title = title.replace(/\s*[-–—:]\s*due\s*$/i, '').trim()
  title = title.replace(/\s+\b(?:template|submission)\b\s*$/i, '').trim()
  return title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

export function displayEventTitle(value: string) {
  return value.trim()
    .replace(/\s*[-–—:]\s*due\s*$/i, '')
    .replace(/\s+\b(?:template|submission)\b\s*$/i, '')
    .trim()
}

export function mergeDuplicateEvents(events: AcademicEvent[]) {
  const titleGroups = new Map<string, AcademicEvent[]>()
  for (const event of events) {
    const key = `${event.courseId}::${canonicalEventTitle(event.title) || event.title.toLocaleLowerCase()}`
    titleGroups.set(key, [...(titleGroups.get(key) ?? []), event])
  }
  const groups = [...titleGroups.values()].flatMap(clusterNearbyEvents)
  return groups.map((group) => {
    const representative = group.reduce((latest, event) =>
      DateTime.fromISO(event.dueAt).toMillis() > DateTime.fromISO(latest.dueAt).toMillis() ? event : latest)
    const editedStatus = group.filter((event) => event.userEdited)
      .sort((a, b) => Date.parse(b.updatedAt ?? '') - Date.parse(a.updatedAt ?? ''))[0]
    const statusSource = editedStatus ?? group.find((event) => event.status === 'done') ?? representative
    const times = [...new Map(group.map((event) => {
      const sourceLabel = event.sourceLabel || readableSource(event.sourceType)
      return [`${sourceLabel}::${event.dueAt}`, { dueAt: event.dueAt, sourceLabel }]
    })).values()].sort((a, b) => DateTime.fromISO(a.dueAt).toMillis() - DateTime.fromISO(b.dueAt).toMillis())
    const labels = [...new Set(group.map((event) => event.sourceLabel || readableSource(event.sourceType)))]
    const titles = group.map((event) => displayEventTitle(event.title)).filter(Boolean)
    return {
      ...representative,
      status: statusSource.status,
      title: titles.reduce((best, title) => title.length < best.length ? title : best, titles[0] ?? representative.title),
      sourceLabel: labels.join(' + '),
      sourceDueTimes: times
    }
  })
}

const DUPLICATE_WINDOW_MS = 12 * 60 * 60 * 1000

function clusterNearbyEvents(events: AcademicEvent[]) {
  const sorted = [...events].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
  const clusters: AcademicEvent[][] = []
  for (const event of sorted) {
    const dueAt = Date.parse(event.dueAt)
    const cluster = clusters.find((items) => Math.abs(dueAt - Date.parse(items[0].dueAt)) <= DUPLICATE_WINDOW_MS)
    if (cluster) cluster.push(event)
    else clusters.push([event])
  }
  return clusters
}

function readableSource(value: string) {
  return value.replace(/_api$/i, '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export type EventGroup = 'Today' | 'Tomorrow' | 'Next 7 days' | 'Later' | 'Past'

export function groupForDate(dueAt: string, timezone: string, reference: DateTime<boolean> = DateTime.now()): EventGroup {
  const now = reference.setZone(timezone).startOf('day')
  const due = DateTime.fromISO(dueAt, { setZone: true }).setZone(timezone).startOf('day')
  const days = Math.round(due.diff(now, 'days').days)
  if (days < 0) return 'Past'
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days <= 7) return 'Next 7 days'
  return 'Later'
}

export function toDateTimeInput(iso: string, timezone: string) {
  return DateTime.fromISO(iso, { setZone: true }).setZone(timezone).toFormat("yyyy-MM-dd'T'HH:mm")
}

export function fromDateTimeInput(value: string, timezone: string) {
  return DateTime.fromFormat(value, "yyyy-MM-dd'T'HH:mm", { zone: timezone }).toISO() ?? value
}

export function eventDateTime(iso: string, timezone: string, locale?: string) {
  const value = DateTime.fromISO(iso, { setZone: true }).setZone(timezone)
  return locale ? value.setLocale(locale) : value
}

export function defaultEventDueAt(timezone: string, reference: DateTime = DateTime.now()) {
  const localDue = reference.setZone(timezone).plus({ days: 1 }).toFormat("yyyy-MM-dd'T'HH:mm")
  return fromDateTimeInput(localDue, timezone)
}
