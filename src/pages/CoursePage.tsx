import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, ChevronUp, ExternalLink, FileText, Pencil, Plus, Upload, X } from 'lucide-react'
import { DateTime } from 'luxon'
import type { AcademicEvent, Course, EventStatus, GradingItem, SyllabusInfo } from '../domain/types'
import { eventDateTime, sortEvents } from '../domain/event/eventUtils'
import { EventRow } from '../components/EventRow'
import { courseColorClass, courseColorStyle } from '../domain/courseColor'
import { useI18n } from '../i18n'
import { Modal } from '../components/Modal'
import { SyllabusDocument } from '../components/SyllabusDocument'
import { gradeAThresholdPercent, gradeContribution, gradingModeFor, projectedGrade, type GradingMode } from '../domain/grading'

type Tab = 'deadlines' | 'syllabus'
type UpcomingRange = '14' | '30' | 'all'
type SyllabusField = 'rawSummary' | 'officeHours' | 'attendancePolicy' | 'latePolicy'
type GradePanel = 'breakdown' | 'planner'

export function CoursePage({ course, events, syllabus, gradingItems, gradingDisplayMode, gradingTarget, onSaveCourse, onEditCourse, onAddEvent, onAddExam, onOpenEvent, onStatus, onSaveSyllabus, onSaveGrades }: {
  course: Course; events: AcademicEvent[]; syllabus?: SyllabusInfo; gradingItems: GradingItem[]
  gradingDisplayMode: GradingMode; gradingTarget: number | null
  onSaveCourse: (course: Course) => void; onEditCourse: () => void; onAddEvent: () => void; onAddExam: () => void
  onOpenEvent: (event: AcademicEvent) => void; onStatus: (event: AcademicEvent, status: EventStatus) => void
  onSaveSyllabus: (value: SyllabusInfo) => void; onSaveGrades: (items: GradingItem[], gradingMode: GradingMode, target: number) => void
}) {
  const { locale, t, courseName, termName } = useI18n()
  const [tab, setTab] = useState<Tab>('deadlines')
  const [notes, setNotes] = useState(course.notes)
  const [syllabusDraft, setSyllabusDraft] = useState<SyllabusInfo>(syllabus ?? blankSyllabus(course.id))
  const [gradesDraft, setGradesDraft] = useState<GradingItem[]>(() => withDefaultLost(gradingItems))
  const [gradePanel, setGradePanel] = useState<GradePanel>('breakdown')
  const [gradeTargetDraft, setGradeTargetDraft] = useState<number | null>(gradingTarget)
  const [gradePlanDirty, setGradePlanDirty] = useState(false)
  const [upcomingRange, setUpcomingRange] = useState<UpcomingRange>('14')
  const [completedExpanded, setCompletedExpanded] = useState(false)
  const [syllabusViewerOpen, setSyllabusViewerOpen] = useState(false)
  const [activeSyllabusField, setActiveSyllabusField] = useState<SyllabusField>()
  const [fieldEditing, setFieldEditing] = useState(false)
  const [fieldDraft, setFieldDraft] = useState('')
  useEffect(() => { setNotes(course.notes); setTab('deadlines'); setUpcomingRange('14'); setCompletedExpanded(false); setSyllabusViewerOpen(false); setActiveSyllabusField(undefined); setGradePanel('breakdown'); setGradePlanDirty(false) }, [course.id])
  useEffect(() => { setSyllabusDraft(syllabus ?? blankSyllabus(course.id)); setGradesDraft(withDefaultLost(gradingItems)); setGradeTargetDraft(gradingTarget) }, [course.id, syllabus, gradingItems, gradingTarget])
  useEffect(() => {
    if (notes === course.notes) return
    const timer = setTimeout(() => onSaveCourse({ ...course, notes }), 650)
    return () => clearTimeout(timer)
  }, [notes, course, onSaveCourse])
  const sorted = useMemo(() => sortEvents(events), [events])
  const now = DateTime.now().setZone(course.timezone)
  const today = now.startOf('day')
  const allUpcoming = sorted.filter((e) => e.status !== 'done' && DateTime.fromISO(e.dueAt, { setZone: true }).setZone(course.timezone) >= now)
  const cutoff = upcomingRange === 'all' ? null : today.plus({ days: Number(upcomingRange) }).endOf('day')
  const upcoming = cutoff ? allUpcoming.filter((e) => DateTime.fromISO(e.dueAt, { setZone: true }).setZone(course.timezone) <= cutoff) : allUpcoming
  const completed = sorted.filter((e) => e.status === 'done')
  const overdue = sorted.filter((e) => e.status !== 'done' && DateTime.fromISO(e.dueAt, { setZone: true }).setZone(course.timezone) < now)
  const nextExam = allUpcoming.find((e) => e.type === 'exam')
  const attach = async () => {
    const file = await window.dailyRoutine.chooseSyllabus()
    if (file) {
      const next = { ...syllabusDraft, ...file }
      setSyllabusDraft(next)
      onSaveSyllabus(next)
    }
  }
  const syllabusFields: Array<{ key: SyllabusField; label: string; placeholder: string }> = [
    { key:'rawSummary', label:t('courseSummary'), placeholder:t('summaryPlaceholder') },
    { key:'officeHours', label:t('officeHours'), placeholder:t('noDetailsYet') },
    { key:'attendancePolicy', label:t('attendancePolicy'), placeholder:t('noDetailsYet') },
    { key:'latePolicy', label:t('latePolicy'), placeholder:t('noDetailsYet') }
  ]
  const openSyllabusField = (key: SyllabusField) => {
    setActiveSyllabusField(key)
    setFieldDraft(syllabusDraft[key])
    setFieldEditing(false)
  }
  const closeSyllabusField = () => { setActiveSyllabusField(undefined); setFieldEditing(false) }
  const saveSyllabusField = () => {
    if (!activeSyllabusField) return
    const next = { ...syllabusDraft, [activeSyllabusField]:fieldDraft }
    setSyllabusDraft(next)
    onSaveSyllabus(next)
    closeSyllabusField()
  }
  const activeFieldDefinition = syllabusFields.find((field) => field.key === activeSyllabusField)
  const setGradeValue = (index: number, patch: Partial<GradingItem>) => setGradesDraft((all) => all.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  const setPlannerGradeValue = (index: number, patch: Partial<GradingItem>) => {
    setGradeValue(index, patch)
    setGradePlanDirty(true)
  }
  const addGradeItem = () => setGradesDraft((all) => [...all, {
    id:crypto.randomUUID(), courseId:course.id, label:t('category'), weight:0, points:gradeMode === 'points' ? 0 : null,
    targetPoints:null, currentPoints:null, currentMode:'lost', userEdited:true
  }])
  const gradeMode = gradingModeFor(gradesDraft, gradingDisplayMode)
  const percentageTotal = gradesDraft.reduce((sum, item) => sum + Number(item.weight || 0), 0)
  const pointsTotal = gradesDraft.reduce((sum, item) => sum + Number(item.points || 0), 0)
  const projection = projectedGrade(gradesDraft, gradeMode)
  const syllabusATarget = gradeAThresholdPercent(syllabusDraft.rawText?.trim() || syllabusDraft.rawSummary) ?? 93
  const defaultGradeTarget = gradeMode === 'points' ? Math.round(pointsTotal * syllabusATarget) / 100 : syllabusATarget
  const gradeTarget = gradeTargetDraft ?? defaultGradeTarget
  const targetDifference = projection.value - gradeTarget
  const score = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1)
  const preciseScore = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(2)
  useEffect(() => {
    if (!gradePlanDirty) return
    const timer = setTimeout(() => {
      setGradePlanDirty(false)
      onSaveGrades(gradesDraft, gradeMode, gradeTarget)
    }, 550)
    return () => clearTimeout(timer)
  }, [gradePlanDirty, gradesDraft, gradeMode, gradeTarget, onSaveGrades])
  return <div className="page course-page">
    <header className="course-hero"><div><div className="course-code-line"><span className={`course-swatch ${courseColorClass(course.colorKey)}`} style={courseColorStyle(course.colorKey)}/><span>{course.code}</span></div><h1>{courseName(course.name) || t('courseName')}</h1><p>{course.instructor || t('instructorName')} · {termName(course.term) || t('term')}</p></div>
      <button className="button secondary" onClick={onEditCourse}><Pencil size={15}/>{t('editCourse')}</button></header>
    <div className="tabs" role="tablist">{(['deadlines','syllabus'] as Tab[]).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{t(item)}</button>)}</div>
    {tab === 'deadlines' && <div className="tab-content deadlines-tab deadlines-layout">
      <main className="deadlines-main">
        <div className="section-heading deadlines-heading"><div><p className="eyebrow">{t('courseSchedule')}</p><h2>{t('deadlinesAndExams')}</h2></div><button className="button primary" onClick={onAddEvent}><Plus size={16}/>{t('addEvent')}</button></div>
        <section className="event-group"><div className="group-heading"><h2>{t('upcoming')}</h2><span>{upcoming.length}</span><div className="range-selector" role="group" aria-label={t('upcoming')}>{([['14',t('twoWeeks')],['30',t('oneMonth')],['all',t('all')]] as Array<[UpcomingRange,string]>).map(([value,label]) => <button type="button" key={value} className={upcomingRange === value ? 'active' : ''} onClick={() => setUpcomingRange(value)}>{label}</button>)}</div></div>{upcoming.map((event) => <EventRow compact key={event.id} event={event} course={course} onOpen={() => onOpenEvent(event)} onStatus={(s) => onStatus(event,s)}/>)}{!upcoming.length && <p className="empty-inline">{t('noUpcomingRange')}</p>}</section>
        <section className="event-group"><div className="group-heading"><h2>{t('overdue')}</h2><span>{overdue.length}</span></div>{overdue.map((event) => <EventRow compact statusClickTarget="done" key={event.id} event={event} course={course} onOpen={() => onOpenEvent(event)} onStatus={(s) => onStatus(event,s)}/>)}{!overdue.length && <p className="empty-inline">{t('nothingOverdue')}</p>}</section>
        <section className={`event-group ${completedExpanded ? '' : 'collapsed'}`}><div className="group-heading"><button type="button" className="group-toggle" aria-expanded={completedExpanded} onClick={() => setCompletedExpanded((value) => !value)}><h2>{t('completed')}</h2><span>{completed.length}</span>{completedExpanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}</button></div>{completedExpanded && completed.map((event) => <EventRow compact key={event.id} event={event} course={course} onOpen={() => onOpenEvent(event)} onStatus={(s) => onStatus(event,s)}/>)}{completedExpanded && !completed.length && <p className="empty-inline">{t('nothingCompleted')}</p>}</section>
      </main>
      <aside className="deadline-sidebar">
        <section className="content-section deadline-notes"><div className="section-heading"><div><p className="eyebrow">{t('personal')}</p><h2>{t('notes')}</h2></div></div>
          <textarea className="notes-area deadline-notes-area" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('notesPlaceholder')}/>
          <span className="save-state">{t('autosaves')}</span>
        </section>
        <section className="summary-card next-exam-card"><div className="next-exam-heading"><p className="eyebrow">{t('nextExam')}</p><button className="text-button" onClick={onAddExam}><Plus size={13}/>{t('addExam')}</button></div>{nextExam ? <button onClick={() => onOpenEvent(nextExam)}><strong>{nextExam.title}</strong><span>{eventDateTime(nextExam.dueAt, course.timezone, locale).toFormat('cccc, LLL d · h:mm a')}</span></button> : <p className="subtle">{t('noUpcomingExam')}</p>}</section>
      </aside>
    </div>}
    {tab === 'syllabus' && <div className="tab-content syllabus-layout">
      <section className="content-section"><div className="section-heading"><div><p className="eyebrow">{t('sourceDocument')}</p><h2>{t('syllabus')}</h2></div></div>
        <div className="syllabus-field-grid">{syllabusFields.map((field) => <button className="syllabus-field-card" key={field.key} onClick={() => openSyllabusField(field.key)}>
          <span className="syllabus-field-heading"><strong>{field.label}</strong><ChevronRight size={16}/></span>
          <span className={`syllabus-field-preview ${syllabusDraft[field.key] ? '' : 'empty'}`}>{syllabusDraft[field.key] || field.placeholder}</span>
          <small>{t('viewDetails')}</small>
        </button>)}</div>
        <div className="syllabus-source-actions">
          <button className="compact-document compact-document-view syllabus-document-card" onClick={() => setSyllabusViewerOpen(true)}>{syllabusDraft.rawText || syllabusDraft.rawSummary ? <FileText size={20}/> : <Upload size={20}/>}<span><strong>{syllabusDraft.fileName || (syllabusDraft.sourceType === 'brightspace_api' ? t('brightspaceSyllabus') : t('attachPdf'))}</strong><small>{t('viewFullSyllabus')}</small></span><ChevronRight size={15}/></button>
        </div>
      </section>
      <section className="content-section grade-section"><div className="section-heading"><div><p className="eyebrow">{t('structuredData')}</p><h2>{t('grades')}</h2></div></div>
        <div className="grade-panel-tabs" role="tablist">
          <button type="button" className={gradePanel === 'breakdown' ? 'active' : ''} onClick={() => setGradePanel('breakdown')}>{t('gradeBreakdown')}</button>
          <button type="button" className={gradePanel === 'planner' ? 'active' : ''} onClick={() => setGradePanel('planner')}>{t('scorePlanner')}</button>
        </div>
        {gradePanel === 'breakdown' ? <>
          <div className="grade-editor">{gradesDraft.map((item, index) => <div className="grade-edit-row" key={item.id}>
            <input aria-label={t('category')} value={item.label} onChange={(event) => setGradeValue(index, { label:event.target.value })}/>
            <div className="weight-input"><input type="number" min="0" max={gradeMode === 'percentage' ? 100 : undefined}
              value={gradeMode === 'percentage' ? item.weight : item.points ?? ''}
              onChange={(event) => setGradeValue(index, gradeMode === 'percentage' ? { weight:Number(event.target.value) } : { points:optionalNumber(event.target.value) })}/><span>{gradeMode === 'percentage' ? '%' : t('pointsShort')}</span></div>
            <button className="icon-button" aria-label={t('remove')} onClick={() => setGradesDraft((all) => all.filter((_, itemIndex) => itemIndex !== index))}>×</button>
          </div>)}</div>
          <button className="text-button" onClick={addGradeItem}><Plus size={14}/>{t('addCategory')}</button>
          <div className="grade-total"><span>{t('total')}</span><strong>{score(gradeMode === 'percentage' ? percentageTotal : pointsTotal)}{gradeMode === 'percentage' ? '%' : ` ${t('pointsShort')}`}</strong></div>
          <div className="align-right"><button className="button primary" onClick={() => onSaveGrades(gradesDraft, gradeMode, gradeTarget)}>{t('saveGradeBreakdown')}</button></div>
        </> : <>
          <p className="grade-planner-hint">{t('scorePlannerHint')}</p>
          <div className="grade-projection-table">
            <div className="grade-projection-heading"><span>{t('category')}</span><span>{gradeMode === 'points' ? t('maxScore') : t('weight')}</span><span>{t('myExpectedScore')}</span><span>{t('contribution')}</span></div>
            <div className="grade-plan-list">{gradesDraft.map((item, index) => {
              const calculation = gradeContribution(item, gradeMode)
              const basis = gradeMode === 'points' ? Number(item.points ?? 0) : Number(item.weight || 0)
              return <div className="grade-projection-row" key={item.id}>
                <strong title={item.label}>{item.label}</strong>
                <span className="grade-basis-value">{score(basis)}{gradeMode === 'points' ? ` ${t('pointsShort')}` : '%'}</span>
                <label className="grade-current-field"><span>{t('myExpectedScore')}</span><div><input type="number" min="0" max={gradeMode === 'points' ? Number(item.points ?? 0) || undefined : 100} value={item.currentPoints ?? ''} onChange={(event) => setPlannerGradeValue(index, { currentPoints:optionalNumber(event.target.value) })}/><ScoreModeSelect value={item.currentMode ?? 'lost'} earnedLabel={t('earned')} lostLabel={t('lost')} onChange={(currentMode) => setPlannerGradeValue(index, { currentMode })}/></div></label>
                <span className="grade-contribution"><strong>{calculation.contribution === null ? '—' : `${preciseScore(calculation.contribution)}${gradeMode === 'points' ? ` ${t('pointsShort')}` : '%'}`}</strong>{calculation.earned !== null && <small>{gradeMode === 'percentage' ? `${score(basis)}% × ${score(calculation.earned)}%` : `${score(calculation.earned)} / ${score(basis)} ${t('pointsShort')}`}</small>}</span>
              </div>
            })}</div>
          </div>
          {!gradesDraft.length && <p className="empty-inline grade-plan-empty">{t('addGradeCategoriesFirst')}</p>}
          <div className="grade-projection-summary">
            <div><span>{t('projectedGrade')}</span><strong>{projection.hasScores ? `${preciseScore(projection.value)}${gradeMode === 'points' ? ` ${t('pointsShort')}` : '%'}` : '—'}</strong></div>
            <label><span>{t('targetGrade')}</span><span className="grade-target-input"><input type="number" min="0" max={gradeMode === 'points' ? pointsTotal || undefined : 100} value={gradeTarget} onChange={(event) => { setGradeTargetDraft(optionalNumber(event.target.value)); setGradePlanDirty(true) }}/><em>{gradeMode === 'points' ? t('pointsShort') : '%'}</em></span></label>
            <div><span>{projection.hasScores ? (targetDifference >= 0 ? t('aboveTarget') : t('belowTarget')) : t('difference')}</span><strong className={projection.hasScores ? (targetDifference >= 0 ? 'positive' : 'negative') : ''}>{projection.hasScores ? `${targetDifference >= 0 ? '+' : '−'}${preciseScore(Math.abs(targetDifference))}${gradeMode === 'points' ? ` ${t('pointsShort')}` : '%'}` : '—'}</strong></div>
          </div>
          {!projection.complete && projection.hasScores && <p className="grade-projection-note">{t('incompleteProjection')}</p>}
          <span className="save-state grade-planner-save-state">{t('autosaves')}</span>
        </>}
        {gradePanel === 'breakdown' && <>
          <div className="grade-detected-mode"><span>{t('gradingBasis')}</span><strong>{gradeMode === 'points' ? t('pointsBased') : t('weightedPercentage')}</strong></div>
          <div className="parser-note"><BookOpen size={18}/><p><strong>{t('parsingStatus')}</strong><br/>{syllabusDraft.sourceType === 'brightspace_api' ? t('parserBrightspace') : t('parserLocal')}</p></div>
        </>}
      </section>
    </div>}
    {activeSyllabusField && activeFieldDefinition && <Modal title={activeFieldDefinition.label} onClose={closeSyllabusField} wide className="syllabus-field-modal">
      <div className="syllabus-field-modal-body">
        {fieldEditing
          ? <textarea autoFocus value={fieldDraft} onChange={(event) => setFieldDraft(event.target.value)} placeholder={activeFieldDefinition.placeholder}/>
          : <div className={`syllabus-field-reading ${fieldDraft ? '' : 'empty'}`}>{fieldDraft || activeFieldDefinition.placeholder}</div>}
      </div>
      <footer className="syllabus-field-modal-actions">
        {fieldEditing ? <span/> : <button className="button secondary" onClick={() => setFieldEditing(true)}><Pencil size={14}/>{t('edit')}</button>}
        <div>{fieldEditing ? <><button className="button secondary" onClick={() => { setFieldDraft(syllabusDraft[activeSyllabusField]); setFieldEditing(false) }}>{t('cancel')}</button><button className="button primary" onClick={saveSyllabusField}>{t('saveChanges')}</button></> : <button className="button primary" onClick={closeSyllabusField}>{t('done')}</button>}</div>
      </footer>
    </Modal>}
    {syllabusViewerOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSyllabusViewerOpen(false) }}>
      <section className="modal wide syllabus-viewer" role="dialog" aria-modal="true" aria-label={t('fullSyllabus')}>
        <header><div><p className="eyebrow">{t('sourceDocument')}</p><h2>{syllabusDraft.fileName || `${course.code} ${t('syllabus')}`}</h2></div><button className="icon-button" aria-label={t('closeSyllabus')} onClick={() => setSyllabusViewerOpen(false)}><X size={18}/></button></header>
        <div className="syllabus-viewer-body"><SyllabusDocument content={syllabusDraft.rawText?.trim() || syllabusDraft.rawSummary?.trim() || ''} emptyText={t('noSyllabus')} overviewTitle={t('syllabusOverview')} contentsTitle={t('syllabusContents')}/></div>
        <footer className="syllabus-viewer-actions"><button className="text-button" onClick={attach}>{t('clickReplace')}</button><div>{syllabusDraft.filePath && <button className="button secondary" onClick={() => window.dailyRoutine.openPath(syllabusDraft.filePath!)}><ExternalLink size={15}/>{t('openPdf')}</button>}<button className="button primary" onClick={() => setSyllabusViewerOpen(false)}>{t('done')}</button></div></footer>
      </section>
    </div>}
  </div>
}

const blankSyllabus = (courseId: string): SyllabusInfo => ({ courseId, attendancePolicy:'', latePolicy:'', officeHours:'', rawSummary:'' })
const optionalNumber = (value: string) => value === '' ? null : Number(value)
const withDefaultLost = (items: GradingItem[]) => items.map((item) => item.currentPoints === null || item.currentPoints === undefined
  ? { ...item, currentMode:'lost' as const }
  : item)

function ScoreModeSelect({ value, earnedLabel, lostLabel, onChange }: {
  value:'earned' | 'lost'; earnedLabel:string; lostLabel:string; onChange:(value: 'earned' | 'lost') => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])
  const options = [{ value:'earned' as const, label:earnedLabel }, { value:'lost' as const, label:lostLabel }]
  return <div className="score-mode-select" ref={root}>
    <button type="button" className="score-mode-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span>{value === 'lost' ? lostLabel : earnedLabel}</span><ChevronDown size={13}/>
    </button>
    {open && <div className="score-mode-menu" role="listbox">{options.map((option) => <button type="button" role="option" aria-selected={option.value === value} className={`score-mode-option ${option.value === value ? 'active' : ''}`} key={option.value} onClick={() => { onChange(option.value); setOpen(false) }}>{option.label}</button>)}</div>}
  </div>
}
