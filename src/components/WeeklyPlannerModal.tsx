import { useMemo, useState } from 'react'
import { CalendarDays, Check, Clock3, GripVertical } from 'lucide-react'
import type { DragEvent } from 'react'
import { DateTime } from 'luxon'
import type { AcademicEvent, Course, EventPlan } from '../domain/types'
import { courseColorClass, courseColorStyle } from '../domain/courseColor'
import { eventDateTime } from '../domain/event/eventUtils'
import { useI18n } from '../i18n'
import { Modal } from './Modal'

export interface EventPlanChange {
  eventId: string
  plannedDate: string | null
}

export function planningWindow(events: AcademicEvent[], timezone: string) {
  const start = DateTime.now().setZone(timezone).startOf('day')
  const end = start.plus({ days:13 }).endOf('day')
  return events
    .filter((event) => {
      const dueAt = eventDateTime(event.dueAt, timezone)
      return event.status !== 'done' && dueAt.isValid && dueAt >= start && dueAt <= end
    })
    .sort((a, b) => eventDateTime(a.dueAt, timezone).toMillis() - eventDateTime(b.dueAt, timezone).toMillis())
}

export function WeeklyPlannerModal({ courses, events, plans, timezone, onClose, onSave }: {
  courses: Course[]
  events: AcademicEvent[]
  plans: EventPlan[]
  timezone: string
  onClose: () => void
  onSave: (changes: EventPlanChange[]) => Promise<void>
}) {
  const { language, locale, t } = useI18n()
  const today = DateTime.now().setZone(timezone).startOf('day')
  const days = useMemo(() => Array.from({ length:7 }, (_, index) => today.plus({ days:index })), [today.toISODate(), timezone])
  const tasks = useMemo(() => planningWindow(events, timezone), [events, timezone, today.toISODate()])
  const allowedDates = useMemo(() => new Set(days.map((day) => day.toISODate()!)), [days])
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(
    plans.filter((plan) => allowedDates.has(plan.plannedDate)).map((plan) => [plan.eventId, plan.plannedDate])
  ))
  const [saving, setSaving] = useState(false)
  const [draggingEventId, setDraggingEventId] = useState<string>()
  const [dragOverDate, setDragOverDate] = useState<string>()

  const startDragging = (event: DragEvent<HTMLElement>, eventId: string) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', eventId)
    setDraggingEventId(eventId)
  }

  const dropOnDay = (event: DragEvent<HTMLElement>, plannedDate: string) => {
    event.preventDefault()
    const eventId = event.dataTransfer.getData('text/plain') || draggingEventId
    if (eventId && tasks.some((task) => task.id === eventId)) {
      setDraft((current) => ({ ...current, [eventId]:plannedDate }))
    }
    setDraggingEventId(undefined)
    setDragOverDate(undefined)
  }

  const save = async () => {
    setSaving(true)
    try {
      await onSave(tasks.map((task) => ({ eventId:task.id, plannedDate:draft[task.id] || null })))
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return <Modal title={t('plannerTitle')} onClose={onClose} wide className="weekly-planner-modal">
    <div className="weekly-planner-intro">
      <CalendarDays size={18}/>
      <div><strong>{t('plannerSubtitle')}</strong><span>{today.setLocale(locale).toFormat(language === 'zh' ? 'M月d日' : 'MMM d')} – {today.plus({ days:6 }).setLocale(locale).toFormat(language === 'zh' ? 'M月d日' : 'MMM d')}</span></div>
    </div>
    <div className="weekly-planner-layout">
      <section className="planner-task-column">
        <div className="planner-section-title"><h3>{t('twoWeekTasks')}</h3><span>{tasks.length}</span></div>
        <div className="planner-task-list">
          {tasks.length === 0 && <div className="planner-empty"><Check size={20}/><span>{t('noTasksToPlan')}</span></div>}
          {tasks.map((event) => {
            const course = courses.find((item) => item.id === event.courseId)
            return <article className={`planner-task ${draggingEventId === event.id ? 'dragging' : ''}`} key={event.id} draggable
              onDragStart={(dragEvent) => startDragging(dragEvent, event.id)}
              onDragEnd={() => { setDraggingEventId(undefined); setDragOverDate(undefined) }} title={t('dragTaskHint')}>
              <GripVertical className="planner-drag-handle" size={16}/>
              <span className={`planner-course-dot ${courseColorClass(course?.colorKey)}`} style={courseColorStyle(course?.colorKey)}/>
              <div className="planner-task-copy">
                <strong>{event.title}</strong>
                <span>{course?.code ?? t('unknownCourse')} · {t('due')} {eventDateTime(event.dueAt, timezone).setLocale(locale).toFormat(language === 'zh' ? 'M月d日 HH:mm' : 'MMM d · h:mm a')}</span>
              </div>
              <select value={draft[event.id] ?? ''} aria-label={`${event.title} ${t('day')}`} onChange={(e) => setDraft((current) => ({ ...current, [event.id]:e.target.value }))}>
                <option value="">{t('unscheduled')}</option>
                {days.map((day, index) => <option key={day.toISODate()} value={day.toISODate()!}>
                  {index === 0 ? t('today') : day.setLocale(locale).toFormat(language === 'zh' ? 'ccc M/d' : 'ccc, MMM d')}
                </option>)}
              </select>
            </article>
          })}
        </div>
      </section>
      <section className="planner-day-column">
        <div className="planner-section-title"><h3>{t('dailyPlan')}</h3><span>{Object.values(draft).filter(Boolean).length} {t('planned')}</span></div>
        <div className="planner-days">
          {days.map((day, index) => {
            const date = day.toISODate()!
            const dayTasks = tasks.filter((task) => draft[task.id] === date)
            return <article className={`planner-day ${dragOverDate === date ? 'drag-over' : ''}`} key={date}
              onDragEnter={(dragEvent) => { dragEvent.preventDefault(); setDragOverDate(date) }}
              onDragOver={(dragEvent) => { dragEvent.preventDefault(); dragEvent.dataTransfer.dropEffect = 'move' }}
              onDragLeave={(dragEvent) => { if (!dragEvent.currentTarget.contains(dragEvent.relatedTarget as Node | null)) setDragOverDate(undefined) }}
              onDrop={(dragEvent) => dropOnDay(dragEvent, date)}>
              <div className="planner-day-heading">
                <strong>{index === 0 ? t('today') : day.setLocale(locale).toFormat('cccc')}</strong>
                <span>{day.setLocale(locale).toFormat(language === 'zh' ? 'M月d日' : 'MMM d')}</span>
              </div>
              <div className="planner-day-tasks">
                {dayTasks.length === 0 && <small>{dragOverDate === date ? t('dropTaskHere') : t('noTasksForDay')}</small>}
                {dayTasks.map((task) => {
                  const course = courses.find((item) => item.id === task.courseId)
                  return <div className="planner-day-task" key={task.id}>
                    <span className={`planner-course-dot ${courseColorClass(course?.colorKey)}`} style={courseColorStyle(course?.colorKey)}/>
                    <span><strong>{task.title}</strong><small>{course?.code ?? t('unknownCourse')}</small></span>
                  </div>
                })}
              </div>
            </article>
          })}
        </div>
      </section>
    </div>
    <footer className="weekly-planner-actions">
      <span><Clock3 size={14}/>{t('nextWeekPlanHint')}</span>
      <div><button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" disabled={saving} onClick={() => void save()}>{saving ? t('saving') : t('savePlan')}</button></div>
    </footer>
  </Modal>
}
