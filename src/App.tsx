import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { DateTime } from 'luxon'
import type { AcademicEvent, AppState, Course, EventStatus, Page, SyllabusInfo, GradingItem } from './domain/types'
import { Sidebar } from './components/Sidebar'
import { CourseModal } from './components/CourseModal'
import { EventModal } from './components/EventModal'
import { Dashboard } from './pages/Dashboard'
import { CoursePage } from './pages/CoursePage'
import { SchedulePage } from './pages/SchedulePage'
import { CalendarPage } from './pages/CalendarPage'
import { SettingsPage } from './pages/SettingsPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { mergeDuplicateEvents } from './domain/event/eventUtils'
import { I18nProvider, tr, type Language } from './i18n'
import { importBrightspaceForOnboarding, importGradescopeForOnboarding } from './services/onboarding'

const empty: AppState = { courses: [], events: [], syllabi: [], gradingItems: [], meetings: [], detectedEvents: [], eventPlans: [], settings: {} }

export function App() {
  const [state, setState] = useState<AppState>(empty)
  const [page, setPage] = useState<Page>('dashboard')
  const [courseId, setCourseId] = useState<string>()
  const [courseModal, setCourseModal] = useState<Course | 'new' | null>(null)
  const [eventModal, setEventModal] = useState<AcademicEvent | 'new' | 'new-exam' | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const mainShellRef = useRef<HTMLDivElement>(null)
  const language: Language = state.settings.language === 'zh' ? 'zh' : 'en'
  const accentColor = /^#[0-9a-f]{6}$/i.test(state.settings.appAccentColor ?? '') ? state.settings.appAccentColor : '#536faf'
  const defaultTimezone = state.settings.defaultTimezone ?? 'America/Indiana/Indianapolis'
  const defaultTerm = currentAcademicTerm(defaultTimezone)

  useEffect(() => {
    document.documentElement.style.setProperty('--primary', accentColor)
  }, [accentColor])

  useLayoutEffect(() => {
    // Every page shares this scroll container. Reset it when navigating so a long
    // course page cannot make Settings (or another course) open halfway down.
    if (mainShellRef.current) {
      mainShellRef.current.scrollTop = 0
      mainShellRef.current.scrollLeft = 0
    }
  }, [page, courseId])

  const refreshState = useCallback(async () => {
    try { setState(await window.dailyRoutine.getState()); setError(undefined) }
    catch (e) { setError(String(e)) }
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      let lastError: unknown
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const latest = await window.dailyRoutine.getState()
          if (!cancelled) { setState(latest); setError(undefined) }
          return
        } catch (error) {
          lastError = error
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)))
        }
      }
      if (!cancelled) setError(String(lastError))
    }
    void load().finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])
  useEffect(() => window.dailyRoutine.onBrightspaceSync(
    () => { void refreshState() },
    (message) => setError(`Brightspace background sync: ${message}`)
  ), [refreshState])
  useEffect(() => window.dailyRoutine.onGradescopeSync(
    () => { void refreshState() },
    (message) => setError(`Gradescope background sync: ${message}`)
  ), [refreshState])
  useEffect(() => {
    const refreshOnFocus = () => { void refreshState() }
    const refreshOnVisibility = () => { if (document.visibilityState === 'visible') void refreshState() }
    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnVisibility)
    return () => {
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnVisibility)
    }
  }, [refreshState])
  const perform = useCallback(async (operation: () => Promise<AppState>) => {
    try { setError(undefined); await operation(); const latest = await window.dailyRoutine.getState(); setState(latest); return latest }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); throw e }
  }, [])
  const saveCourse = useCallback((course: Course) => { void perform(() => window.dailyRoutine.saveCourse(course)) }, [perform])
  const connectBrightspaceForOnboarding = async () => {
    const baseUrl = state.settings.brightspaceBaseUrl ?? 'https://purdue.brightspace.com'
    setState(await importBrightspaceForOnboarding(window.dailyRoutine, baseUrl))
  }
  const connectGradescopeForOnboarding = async () => {
    setState(await importGradescopeForOnboarding(window.dailyRoutine))
  }
  const saveEvent = (event: AcademicEvent) => { void perform(() => window.dailyRoutine.saveEvent({ ...event, userEdited: true })); setEventModal(null) }
  const statusEvent = (event: AcademicEvent, status: EventStatus) => void perform(() => window.dailyRoutine.saveEventStatus({ id:event.id, status }))
  const navigate = (next: Page, id?: string) => { setPage(next); if (id) setCourseId(id) }
  const activeCourse = state.courses.find((c) => c.id === courseId) ?? state.courses[0]
  const displayEvents = useMemo(() => mergeDuplicateEvents(state.events), [state.events])

  if (loading) return <I18nProvider language={language}><div className="app-status"><Loader2 className="spin"/><span>{tr(language,'opening')}</span></div></I18nProvider>
  if (error && !state.courses.length) return <I18nProvider language="zh"><div className="app-status"><AlertTriangle/><strong>数据加载失败，但数据库没有被清空</strong><span>{error}</span><button className="button primary" onClick={() => { setLoading(true); void refreshState().finally(() => setLoading(false)) }}>重新读取</button></div></I18nProvider>
  if (!state.courses.length && !error) return <I18nProvider language={language}>
    <OnboardingPage
      onConnectBrightspace={connectBrightspaceForOnboarding}
      onConnectGradescope={connectGradescopeForOnboarding}
      onAddManually={() => setCourseModal('new')}
    />
    {courseModal && (
      <CourseModal defaultTimezone={defaultTimezone} defaultTerm={defaultTerm} onClose={() => setCourseModal(null)} onSave={(course) => { saveCourse(course); setCourseModal(null) }}/>
    )}
  </I18nProvider>

  return <I18nProvider language={language}><div className="app-shell">
    <Sidebar page={page} courses={state.courses} activeCourseId={activeCourse?.id} onNavigate={navigate} onAddCourse={() => setCourseModal('new')}/>
    <div className="main-shell" ref={mainShellRef}>
      {error && <div className="error-banner"><AlertTriangle size={16}/><span>{error}</span><button onClick={() => setError(undefined)}>{tr(language,'dismiss')}</button></div>}
      {page === 'dashboard' && <Dashboard courses={state.courses} events={displayEvents} meetings={state.meetings} timezone={state.settings.defaultTimezone ?? 'America/Indiana/Indianapolis'} hideCompleted={state.settings.hideCompleted === 'true'}
        onToggleCompleted={(value) => void perform(() => window.dailyRoutine.saveSetting({ key:'hideCompleted', value }))}
        onOpenEvent={setEventModal} onStatus={statusEvent} onAdd={() => setEventModal('new')} onAddExam={() => setEventModal('new-exam')}/>} 
      {page === 'course' && activeCourse && <CoursePage key={activeCourse.id} course={activeCourse}
        events={displayEvents.filter((e) => e.courseId === activeCourse.id)} syllabus={state.syllabi.find((s) => s.courseId === activeCourse.id)}
        gradingItems={state.gradingItems.filter((g) => g.courseId === activeCourse.id)}
        gradingDisplayMode={(state.settings[`gradingMode:${activeCourse.id}`] ?? state.settings[`gradingDisplayMode:${activeCourse.id}`]) === 'points' ? 'points' : 'percentage'}
        gradingTarget={settingNumber(state.settings[`gradingTarget:${activeCourse.id}`])} onSaveCourse={saveCourse}
        onEditCourse={() => setCourseModal(activeCourse)} onAddEvent={() => setEventModal('new')} onAddExam={() => setEventModal('new-exam')} onOpenEvent={setEventModal} onStatus={statusEvent}
        onSaveSyllabus={(value: SyllabusInfo) => void perform(() => window.dailyRoutine.saveSyllabus(value))}
        onSaveGrades={(items: GradingItem[], gradingMode: 'percentage' | 'points', target: number) => void perform(() => window.dailyRoutine.saveGradingItems({ courseId:activeCourse.id, items, gradingMode, target }))}/>
      }
      {page === 'schedule' && <SchedulePage courses={state.courses} meetings={state.meetings}
        onSave={async (meetings, deletedIds) => { await perform(() => window.dailyRoutine.saveSchedule({ meetings, deletedIds })) }}/>} 
      {page === 'calendar' && <CalendarPage courses={state.courses} events={displayEvents} plans={state.eventPlans} timezone={defaultTimezone} onOpenEvent={setEventModal} onAdd={() => setEventModal('new')}
        onSavePlans={async (plans) => { await perform(() => window.dailyRoutine.saveEventPlans({ plans })) }}/>} 
      {page === 'settings' && <SettingsPage courses={state.courses} settings={state.settings}
        onSaveSetting={async (key,value) => { await perform(() => window.dailyRoutine.saveSetting({key,value})) }}
        onStateChange={setState}
        onReset={() => void perform(() => window.dailyRoutine.resetDemo())}/>} 
    </div>
    {courseModal && <CourseModal course={courseModal === 'new' ? undefined : courseModal} defaultTimezone={defaultTimezone} defaultTerm={defaultTerm} onClose={() => setCourseModal(null)}
      onSave={(course) => { saveCourse(course); setCourseModal(null); setCourseId(course.id); setPage('course') }}
      onDelete={courseModal === 'new' ? undefined : () => { if (confirm(`${tr(language,'deleteCourse')} ${courseModal.code} ${tr(language,'deleteCourseConfirm')}`)) { void perform(() => window.dailyRoutine.deleteCourse(courseModal.id)); setCourseModal(null); setPage('dashboard') } }}/>} 
    {eventModal && <EventModal event={typeof eventModal === 'object' ? eventModal : undefined} defaultType={eventModal === 'new-exam' ? 'exam' : undefined} courses={state.courses} defaultCourseId={page === 'course' ? activeCourse?.id : undefined}
      onClose={() => setEventModal(null)} onSave={saveEvent}
      onDelete={typeof eventModal === 'object' ? () => { if (confirm(`${tr(language,'deleteEvent')} “${eventModal.title}”?`)) { void perform(() => window.dailyRoutine.deleteEvent(eventModal.id)); setEventModal(null) } } : undefined}/>} 
  </div></I18nProvider>
}

function currentAcademicTerm(timezone: string) {
  const now = DateTime.now().setZone(timezone)
  const season = now.month <= 5 ? 'Spring' : now.month <= 7 ? 'Summer' : 'Fall'
  return `${season} ${now.year}`
}

function settingNumber(value?: string) {
  const number = Number(value)
  return value !== undefined && Number.isFinite(number) ? number : null
}
