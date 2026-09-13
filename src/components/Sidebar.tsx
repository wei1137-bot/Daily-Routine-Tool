import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { CalendarDays, CalendarRange, GripVertical, LayoutDashboard, Plus, Settings } from 'lucide-react'
import type { Course, Page } from '../domain/types'
import { courseColorClass, courseColorStyle } from '../domain/courseColor'
import { moveCourseTo } from '../domain/courseOrder'
import { useI18n } from '../i18n'

interface Props {
  page: Page; courses: Course[]; activeCourseId?: string
  onNavigate: (page: Page, courseId?: string) => void; onAddCourse: () => void
  onReorderCourses: (courseIds: string[]) => void
}

export function Sidebar({ page, courses, activeCourseId, onNavigate, onAddCourse, onReorderCourses }: Props) {
  const { t } = useI18n()
  const [displayCourses, setDisplayCourses] = useState(courses)
  const [draggingId, setDraggingId] = useState<string>()
  const orderRef = useRef(courses)
  const pressRef = useRef<{ courseId: string; pointerId: number; x: number; y: number; target: HTMLElement }>()
  const draggingIdRef = useRef<string>()
  const longPressTimerRef = useRef<number>()
  const suppressClickRef = useRef(false)

  useEffect(() => {
    if (draggingIdRef.current) return
    setDisplayCourses(courses)
    orderRef.current = courses
  }, [courses])
  useEffect(() => () => window.clearTimeout(longPressTimerRef.current), [])

  const clearLongPress = () => {
    window.clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = undefined
  }
  const beginLongPress = (event: ReactPointerEvent<HTMLButtonElement>, courseId: string) => {
    if (event.button !== 0) return
    clearLongPress()
    pressRef.current = { courseId, pointerId:event.pointerId, x:event.clientX, y:event.clientY, target:event.currentTarget }
    longPressTimerRef.current = window.setTimeout(() => {
      const press = pressRef.current
      if (!press || press.courseId !== courseId) return
      draggingIdRef.current = courseId
      suppressClickRef.current = true
      setDraggingId(courseId)
      try { press.target.setPointerCapture(press.pointerId) } catch { /* Pointer may already be released. */ }
    }, 320)
  }
  const moveLongPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const press = pressRef.current
    if (!press || press.pointerId !== event.pointerId) return
    if (!draggingIdRef.current) {
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6) {
        clearLongPress()
        pressRef.current = undefined
      }
      return
    }
    event.preventDefault()
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-course-id]')
    const targetId = target?.dataset.courseId
    if (!targetId || targetId === draggingIdRef.current) return
    const next = moveCourseTo(orderRef.current, draggingIdRef.current, targetId)
    if (next === orderRef.current) return
    orderRef.current = next
    setDisplayCourses(next)
  }
  const finishLongPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    clearLongPress()
    const wasDragging = Boolean(draggingIdRef.current)
    if (wasDragging) {
      event.preventDefault()
      onReorderCourses(orderRef.current.map((course) => course.id))
      try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* Capture may already be released. */ }
    }
    draggingIdRef.current = undefined
    pressRef.current = undefined
    setDraggingId(undefined)
    if (wasDragging) window.setTimeout(() => { suppressClickRef.current = false }, 0)
  }
  const moveWithKeyboard = (courseId: string, direction: -1 | 1) => {
    const index = orderRef.current.findIndex((course) => course.id === courseId)
    const target = orderRef.current[index + direction]
    if (index < 0 || !target) return
    const next = moveCourseTo(orderRef.current, courseId, target.id)
    orderRef.current = next
    setDisplayCourses(next)
    onReorderCourses(next.map((course) => course.id))
  }
  const Nav = ({ target, label, icon: Icon, badge }: any) => (
    <button className={`nav-item ${page === target ? 'active' : ''}`} onClick={() => onNavigate(target)}>
      <Icon size={17} strokeWidth={1.8}/><span>{label}</span>{badge ? <span className="nav-badge">{badge}</span> : null}
    </button>
  )
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark"><img src="./app-icon.png" alt=""/></div><span>Daily Routine</span></div>
    <nav className="primary-nav">
      <Nav target="dashboard" label={t('dashboard')} icon={LayoutDashboard}/>
      <Nav target="schedule" label={t('schedule')} icon={CalendarRange}/>
      <Nav target="calendar" label={t('calendar')} icon={CalendarDays}/>
    </nav>
    <div className="nav-section-title">{t('courses')}</div>
    <div className="course-nav">
      {displayCourses.map((course) => <button key={course.id} data-course-id={course.id}
        className={`nav-item course-link ${page === 'course' && activeCourseId === course.id ? 'active' : ''} ${draggingId === course.id ? 'dragging' : ''}`}
        aria-label={`${course.code}. ${t('reorderCourseHint')}`} aria-pressed={draggingId === course.id}
        onPointerDown={(event) => beginLongPress(event, course.id)} onPointerMove={moveLongPress}
        onPointerUp={finishLongPress} onPointerCancel={finishLongPress}
        onKeyDown={(event) => {
          if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
          event.preventDefault()
          moveWithKeyboard(course.id, event.key === 'ArrowUp' ? -1 : 1)
        }}
        onClick={(event) => {
          if (suppressClickRef.current) { event.preventDefault(); suppressClickRef.current = false; return }
          onNavigate('course', course.id)
        }}>
        <span className={`course-dot ${courseColorClass(course.colorKey)}`} style={courseColorStyle(course.colorKey)}/><span>{course.code}</span><GripVertical className="course-drag-handle" size={13}/>
      </button>)}
      <button className="nav-item muted" onClick={onAddCourse}><Plus size={16}/><span>{t('addCourse')}</span></button>
    </div>
    <div className="sidebar-bottom"><Nav target="settings" label={t('settings')} icon={Settings}/></div>
  </aside>
}
