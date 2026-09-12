import { CalendarDays, CalendarRange, LayoutDashboard, Plus, Settings } from 'lucide-react'
import type { Course, Page } from '../domain/types'
import { courseColorClass, courseColorStyle } from '../domain/courseColor'
import { useI18n } from '../i18n'

interface Props {
  page: Page; courses: Course[]; activeCourseId?: string
  onNavigate: (page: Page, courseId?: string) => void; onAddCourse: () => void
}

export function Sidebar({ page, courses, activeCourseId, onNavigate, onAddCourse }: Props) {
  const { t } = useI18n()
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
      {courses.map((course) => <button key={course.id}
        className={`nav-item course-link ${page === 'course' && activeCourseId === course.id ? 'active' : ''}`}
        onClick={() => onNavigate('course', course.id)}>
        <span className={`course-dot ${courseColorClass(course.colorKey)}`} style={courseColorStyle(course.colorKey)}/><span>{course.code}</span>
      </button>)}
      <button className="nav-item muted" onClick={onAddCourse}><Plus size={16}/><span>{t('addCourse')}</span></button>
    </div>
    <div className="sidebar-bottom"><Nav target="settings" label={t('settings')} icon={Settings}/></div>
  </aside>
}
