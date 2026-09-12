import { Check, Circle, Clock3, ClockAlert } from 'lucide-react'
import { DateTime } from 'luxon'
import type { AcademicEvent, Course, EventStatus } from '../domain/types'
import { courseColorClass, courseColorStyle } from '../domain/courseColor'
import { useI18n } from '../i18n'

const statusIcon = { not_done: Circle, in_progress: Clock3, done: Check }

export function EventRow({ event, course, onOpen, onStatus, compact = false, statusClickTarget }: {
  event: AcademicEvent; course?: Course; onOpen: () => void
  onStatus: (status: EventStatus) => void; compact?: boolean; statusClickTarget?: EventStatus
}) {
  const { locale, t, eventType, status } = useI18n()
  const Icon = statusIcon[event.status]
  const next: Record<EventStatus, EventStatus> = { not_done: 'in_progress', in_progress: 'done', done: 'not_done' }
  const nextStatus = statusClickTarget ?? next[event.status]
  const due = DateTime.fromISO(event.dueAt, { setZone: true }).setZone(event.dueTimezone).setLocale(locale)
  const distinctTimes = [...new Set((event.sourceDueTimes ?? []).map((item) => item.dueAt))]
  const sourceTimeTooltip = distinctTimes.length > 1
    ? `Deadlines differ by source:\n${event.sourceDueTimes!.map((item) => `${item.sourceLabel}: ${DateTime.fromISO(item.dueAt, { setZone: true }).setZone(event.dueTimezone).toFormat('MMM d · h:mm a')}`).join('\n')}\nShowing the later time.`
    : undefined
  return <div className={`event-row ${event.status === 'done' ? 'completed' : ''} ${compact ? 'compact' : ''}`}>
    <button className={`status-button ${event.status}`} title={`${status(event.status)} → ${status(nextStatus)}`} aria-label={`${t('status')}: ${status(event.status)} → ${status(nextStatus)}`}
      onClick={(e) => { e.stopPropagation(); onStatus(nextStatus) }}><Icon size={16}/></button>
    <button className="event-main" onClick={onOpen}>
      <span className={`course-accent ${courseColorClass(course?.colorKey)}`} style={courseColorStyle(course?.colorKey)}/>
      <span className="event-copy">
        <span className="event-title-line"><span className="event-title">{event.title}</span>{sourceTimeTooltip && <span className="deadline-difference" title={sourceTimeTooltip} aria-label={sourceTimeTooltip}><ClockAlert size={13}/></span>}</span>
        <span className="event-meta">{course?.code ?? t('unknownCourse')} · {eventType(event.type)}</span>
      </span>
      <span className="event-time">{compact ? due.toFormat('MMM d · h:mm a') : due.toFormat('h:mm a')}</span>
    </button>
  </div>
}
