import { useEffect, useRef, useState } from 'react'
import { DateTime } from 'luxon'
import { CalendarDays, CalendarPlus, ChevronDown, ChevronUp, Clock3, MapPin, Plus, SlidersHorizontal } from 'lucide-react'
import type { AcademicEvent, Course, CourseMeeting, EventStatus } from '../domain/types'
import { groupForDate, sortEvents, type EventGroup } from '../domain/event/eventUtils'
import { EventRow } from '../components/EventRow'
import { courseColorClass, courseColorStyle } from '../domain/courseColor'
import { useI18n } from '../i18n'

type LaterRange = '14' | '30' | 'all'

export function Dashboard({ courses, events, meetings, timezone, hideCompleted, onToggleCompleted, onOpenEvent, onStatus, onAdd, onAddExam }: {
  courses: Course[]; events: AcademicEvent[]; meetings: CourseMeeting[]; timezone: string; hideCompleted: boolean; onToggleCompleted: (value: boolean) => void
  onOpenEvent: (event: AcademicEvent) => void; onStatus: (event: AcademicEvent, status: EventStatus) => void; onAdd: () => void; onAddExam: () => void
}) {
  const { language, locale, t, eventGroup } = useI18n()
  const [laterRange, setLaterRange] = useState<LaterRange>('14')
  const [laterExpanded, setLaterExpanded] = useState(false)
  const [pastExpanded, setPastExpanded] = useState(false)
  const [todayClassesExpanded, setTodayClassesExpanded] = useState(true)
  const knownCourseIds = useRef(new Set(courses.map((course) => course.id)))
  const [selectedExamCourseIds, setSelectedExamCourseIds] = useState<Set<string>>(() => new Set(courses.map((course) => course.id)))
  const now = DateTime.now().setZone(timezone).setLocale(locale)
  const greeting = now.hour < 12 ? t('goodMorning') : now.hour < 18 ? t('goodAfternoon') : t('goodEvening')
  const active = sortEvents(events.filter((e) => e.type !== 'exam' && (!hideCompleted || e.status !== 'done')))
  const exams = sortEvents(events.filter((e) => e.type === 'exam' && e.status !== 'done' && DateTime.fromISO(e.dueAt) >= now.startOf('day')))
  const examCourses = courses.filter((course) => exams.some((exam) => exam.courseId === course.id))
  const filteredExams = exams.filter((exam) => selectedExamCourseIds.has(exam.courseId))
  const todayMeetings = meetings
    .filter((meeting) => meeting.dayOfWeek === now.weekday)
    .sort((a,b) => a.startTime.localeCompare(b.startTime))
  useEffect(() => {
    setSelectedExamCourseIds((current) => {
      const available = new Set(courses.map((course) => course.id))
      const next = new Set([...current].filter((id) => available.has(id)))
      courses.forEach((course) => { if (!knownCourseIds.current.has(course.id)) next.add(course.id) })
      knownCourseIds.current = available
      return next
    })
  }, [courses])
  const groups = new Map<EventGroup, AcademicEvent[]>()
  active.forEach((event) => {
    const key = groupForDate(event.dueAt, event.dueTimezone, now)
    groups.set(key, [...(groups.get(key) ?? []), event])
  })
  const laterCutoff = laterRange === 'all' ? null : now.startOf('day').plus({ days:Number(laterRange) }).endOf('day')
  const order: EventGroup[] = ['Today','Tomorrow','Next 7 days','Later','Past']
  return <div className="page dashboard-page">
    <header className="page-header"><div><p className="eyebrow">{now.toFormat(language === 'zh' ? 'yyyy年M月d日 cccc' : 'cccc, LLLL d')}</p><h1>{greeting}</h1><p className="subtitle">{t('ahead')}</p></div>
      <button className="button primary" onClick={onAdd}><Plus size={17}/>{t('addEvent')}</button></header>
    <div className="toolbar-line"><label className="switch-label"><input type="checkbox" checked={hideCompleted} onChange={(e) => onToggleCompleted(e.target.checked)}/><span className="switch"/>{t('hideCompleted')}</label></div>
    <div className="dashboard-grid">
      <main className="dashboard-main-column">
        <section className="today-classes-panel">
          <div className="today-classes-heading"><span><CalendarDays size={16}/><strong>{t('todayClasses')}</strong><span className="count-pill">{todayMeetings.length}</span></span>
            <button type="button" className="text-button" aria-expanded={todayClassesExpanded} onClick={() => setTodayClassesExpanded((value) => !value)}>
              {todayClassesExpanded ? t('hide') : t('show')}{todayClassesExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} 
            </button>
          </div>
          {todayClassesExpanded && <div className="today-classes-list">
            {todayMeetings.map((meeting) => {
              const course = courses.find((candidate) => candidate.id === meeting.courseId)
              const label = meeting.label === 'Lecture' ? t('lecture') : meeting.label === 'Lab' ? t('lab') : meeting.label
              return <article className="today-class-card" key={meeting.id}>
                <span className={`today-class-accent ${courseColorClass(course?.colorKey)}`} style={courseColorStyle(course?.colorKey)}/>
                <span className="today-class-copy"><strong>{course?.code ?? t('unknownCourse')}</strong><small>{label || course?.name}</small></span>
                <span className="today-class-meta"><span><Clock3 size={12}/>{formatMeetingTime(meeting.startTime,locale)}–{formatMeetingTime(meeting.endTime,locale)}</span>{meeting.location && <span><MapPin size={12}/>{meeting.location}</span>}</span>
              </article>
            })}
            {!todayMeetings.length && <p className="subtle today-classes-empty">{t('noClassesToday')}</p>}
          </div>}
        </section>
        <section className="timeline-panel">
        {order.map((group) => {
          const allItems = groups.get(group) ?? []
          const items = group === 'Later' && laterCutoff
            ? allItems.filter((event) => DateTime.fromISO(event.dueAt, { setZone:true }).setZone(timezone) <= laterCutoff)
            : allItems
          if (!allItems.length) return null
          const collapsible = group === 'Later' || group === 'Past'
          const expanded = group === 'Later' ? laterExpanded : group === 'Past' ? pastExpanded : true
          const collapsed = collapsible && !expanded
          return <section className={`event-group ${collapsed ? 'collapsed' : ''}`} key={group}><div className="group-heading">
            {collapsible
              ? <button type="button" className="group-toggle" aria-expanded={expanded} onClick={() => group === 'Later' ? setLaterExpanded((value) => !value) : setPastExpanded((value) => !value)}><h2>{eventGroup(group)}</h2><span>{items.length}</span>{expanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}</button>
              : <div className="group-label"><h2>{eventGroup(group)}</h2><span>{items.length}</span></div>}
            {group === 'Later' && laterExpanded && <div className="range-selector" role="group" aria-label={eventGroup(group)}>{([['14',t('twoWeeks')],['30',t('oneMonth')],['all',t('all')]] as Array<[LaterRange,string]>).map(([value,label]) => <button type="button" key={value} className={laterRange === value ? 'active' : ''} onClick={() => setLaterRange(value)}>{label}</button>)}</div>}
          </div>
            {!collapsed && items.map((event) => <EventRow compact key={event.id} event={event} course={courses.find((c) => c.id === event.courseId)}
              onOpen={() => onOpenEvent(event)} onStatus={(status) => onStatus(event, status)}/>)}
            {group === 'Later' && !collapsed && !items.length && <p className="empty-inline">{t('noUpcomingRange')}</p>}</section>
        })}
        {!active.length && <div className="empty-state"><CalendarPlus size={28}/><h3>{t('nothingOnList')}</h3><p>{t('nothingOnListHint')}</p></div>}
        </section>
      </main>
      <aside className="exams-panel"><div className="panel-title"><span>{t('upcomingExams')}<span className="count-pill">{filteredExams.length}</span></span><button className="text-button exam-add-button" onClick={onAddExam}><Plus size={13}/>{t('addExam')}</button></div>
        {!!examCourses.length && <details className="exam-course-filter"><summary><SlidersHorizontal size={13}/><span>{examFilterLabel(examCourses,selectedExamCourseIds,t('allCourses'),t('noCoursesSelected'),t('coursesSelected'))}</span><ChevronDown size={13}/></summary>
          <div className="exam-course-options">
            <label><input type="checkbox" checked={examCourses.every((course) => selectedExamCourseIds.has(course.id))} onChange={(event) => setSelectedExamCourseIds(event.target.checked ? new Set(courses.map((course) => course.id)) : new Set())}/><strong>{t('allCourses')}</strong></label>
            {examCourses.map((course) => <label key={course.id}><input type="checkbox" checked={selectedExamCourseIds.has(course.id)} onChange={() => setSelectedExamCourseIds((current) => {
              const next = new Set(current)
              if (next.has(course.id)) next.delete(course.id); else next.add(course.id)
              return next
            })}/><span className={`course-dot ${courseColorClass(course.colorKey)}`} style={courseColorStyle(course.colorKey)}/><span>{course.code}</span></label>)}
          </div>
        </details>}
        {filteredExams.map((event) => {
          const course = courses.find((c) => c.id === event.courseId)
          const due = DateTime.fromISO(event.dueAt, { setZone: true }).setZone(event.dueTimezone)
          return <button className="exam-card" key={event.id} onClick={() => onOpenEvent(event)}>
            <span className={`exam-date ${courseColorClass(course?.colorKey)}`} style={courseColorStyle(course?.colorKey)}><strong>{due.toFormat('dd')}</strong><small>{due.toFormat('LLL').toUpperCase()}</small></span>
            <span><strong>{event.title}</strong><small>{course?.code} · {due.toFormat('h:mm a')}</small></span>
          </button>
        })}
        {!filteredExams.length && <p className="subtle empty-copy">{exams.length ? t('noSelectedCourseExams') : t('noUpcomingExams')}</p>}
      </aside>
    </div>
  </div>
}

function formatMeetingTime(value: string, locale: string) {
  return DateTime.fromFormat(value,'HH:mm').setLocale(locale).toFormat('h:mm a')
}

function examFilterLabel(courses: Course[], selected: Set<string>, allLabel: string, noneLabel: string, selectedLabel: string) {
  const selectedCourses = courses.filter((course) => selected.has(course.id))
  if (selectedCourses.length === courses.length) return allLabel
  if (!selectedCourses.length) return noneLabel
  if (selectedCourses.length === 1) return selectedCourses[0].code
  return selectedLabel.replace('{count}',String(selectedCourses.length))
}
