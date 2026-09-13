import { useMemo, useState } from 'react'
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react'
import { DateTime } from 'luxon'
import type { AcademicEvent, Course, EventPlan } from '../domain/types'
import { calendarCourseColorStyle, courseColorClass } from '../domain/courseColor'
import { eventDateTime } from '../domain/event/eventUtils'
import { useI18n } from '../i18n'
import { planningWindow, WeeklyPlannerModal, type EventPlanChange } from '../components/WeeklyPlannerModal'

export function CalendarPage({ courses, events, plans, timezone, onOpenEvent, onSavePlans }: {
  courses: Course[]; events: AcademicEvent[]; plans: EventPlan[]; timezone: string
  onOpenEvent: (event: AcademicEvent) => void; onSavePlans: (changes: EventPlanChange[]) => Promise<void>
}) {
  const { language, locale, t } = useI18n()
  const now = DateTime.now().setZone(timezone)
  const [month, setMonth] = useState(() => now.startOf('month'))
  const [plannerOpen, setPlannerOpen] = useState(false)
  const plannerTasks = useMemo(() => planningWindow(events, timezone), [events, timezone, now.toISODate()])
  const planEnd = now.startOf('day').plus({ days:6 })
  const assignedCount = plans.filter((plan) => {
    const plannedDate = DateTime.fromISO(plan.plannedDate, { zone:timezone })
    return plannerTasks.some((task) => task.id === plan.eventId) && plannedDate >= now.startOf('day') && plannedDate <= planEnd.endOf('day')
  }).length
  const cells = useMemo(() => {
    const first = month.startOf('week')
    return Array.from({ length: 42 }, (_, i) => first.plus({ days: i }))
  }, [month])
  return <div className="page calendar-page">
    <header className="page-header calendar-page-header"><div><p className="eyebrow">{t('academicSchedule')}</p><h1>{t('calendar')}</h1><p className="subtitle">{t('calendarSubtitle')}</p></div></header>
    <div className="calendar-content-actions"><button className="button primary calendar-plan-action" onClick={() => setPlannerOpen(true)} aria-label={t('openPlanner')}>
      <CalendarClock size={17}/><span>{t('nextWeekPlan')}</span><span className="calendar-plan-progress"><strong>{assignedCount} / {plannerTasks.length}</strong><small>{t('planned')}</small></span>
    </button></div>
    <section className="calendar-shell"><div className="calendar-toolbar"><h2>{month.setLocale(locale).toFormat(language === 'zh' ? 'yyyy年 LLLL' : 'LLLL yyyy')}</h2><div><button className="button secondary small" onClick={() => setMonth(DateTime.now().setZone(timezone).startOf('month'))}>{t('thisMonth')}</button><button className="icon-button bordered" onClick={() => setMonth((m) => m.minus({ months: 1 }))}><ChevronLeft size={18}/></button><button className="icon-button bordered" onClick={() => setMonth((m) => m.plus({ months: 1 }))}><ChevronRight size={18}/></button></div></div>
      <div className="calendar-weekdays">{(language === 'zh' ? ['周一','周二','周三','周四','周五','周六','周日'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']).map((d) => <div key={d}>{d}</div>)}</div>
      <div className="calendar-grid">{cells.map((day) => {
        const dayEvents = events.filter((e) => eventDateTime(e.dueAt, timezone).hasSame(day,'day'))
        return <div className={`calendar-cell ${day.month !== month.month ? 'outside' : ''} ${day.hasSame(now,'day') ? 'today' : ''}`} key={day.toISODate()}><span className="day-number">{day.day}</span><div className="day-events">{dayEvents.slice(0,3).map((event) => {
          const course = courses.find((c) => c.id === event.courseId)
          const alternateTimes = [...new Set((event.sourceDueTimes ?? []).map((item) => item.dueAt))]
          const title = alternateTimes.length > 1
            ? `${course?.code}: ${event.title}\n${event.sourceDueTimes!.map((item) => `${item.sourceLabel}: ${eventDateTime(item.dueAt, timezone).toFormat('MMM d · h:mm a')}`).join('\n')}\nShowing the later time.`
            : `${course?.code}: ${event.title}`
          return <button key={event.id} className={`calendar-event ${courseColorClass(course?.colorKey)} ${event.status === 'done' ? 'done' : ''}`} style={calendarCourseColorStyle(course?.colorKey)} onClick={() => onOpenEvent(event)} title={title}><span>{eventDateTime(event.dueAt, timezone).toFormat('h:mm')}</span>{event.title}</button>
        })}{dayEvents.length > 3 && <small>+{dayEvents.length - 3} {t('more')}</small>}</div></div>
      })}</div>
    </section>
    {plannerOpen && <WeeklyPlannerModal courses={courses} events={events} plans={plans} timezone={timezone} onClose={() => setPlannerOpen(false)} onSave={onSavePlans}/>} 
  </div>
}
