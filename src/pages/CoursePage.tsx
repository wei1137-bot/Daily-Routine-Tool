import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, ChevronUp, ExternalLink, FileText, Pencil, Plus, Upload, X } from 'lucide-react'
import { DateTime } from 'luxon'
import type { AcademicEvent, Course, EventStatus, GradingItem, SyllabusFieldKey, SyllabusFieldResult, SyllabusInfo } from '../domain/types'
import { eventDateTime, sortEvents } from '../domain/event/eventUtils'
import { EventRow } from '../components/EventRow'
import { courseColorClass, courseColorStyle, courseColorVariableStyle } from '../domain/courseColor'
import { useI18n } from '../i18n'
import { SyllabusDocument } from '../components/SyllabusDocument'
import { SyllabusFieldCard } from '../components/SyllabusFieldCard'
import { gradeAThresholdPercent, gradeContribution, gradingModeFor, projectedGrade, toLossOnlyGradingItems, type GradingMode } from '../domain/grading'

type Tab = 'deadlines' | 'syllabus'
type UpcomingRange = '14' | '30' | 'all'
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
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const [syllabusDraft, setSyllabusDraft] = useState<SyllabusInfo>(syllabus ?? blankSyllabus(course.id))
  const [gradesDraft, setGradesDraft] = useState<GradingItem[]>(() => lossOnlyGrades(gradingItems, gradingDisplayMode))
  const [editingGradeId, setEditingGradeId] = useState<string>()
  const [gradeEditSnapshot, setGradeEditSnapshot] = useState<GradingItem | null>()
  const [gradePanel, setGradePanel] = useState<GradePanel>('breakdown')
  const [gradeTargetDraft, setGradeTargetDraft] = useState<number | null>(gradingTarget)
  const [gradePlanDirty, setGradePlanDirty] = useState(false)
  const [upcomingRange, setUpcomingRange] = useState<UpcomingRange>('14')
  const [completedExpanded, setCompletedExpanded] = useState(false)
  const [syllabusViewerOpen, setSyllabusViewerOpen] = useState(false)
  useEffect(() => { setNotes(course.notes); setTab('deadlines'); setUpcomingRange('14'); setCompletedExpanded(false); setSyllabusViewerOpen(false); setGradePanel('breakdown'); setGradePlanDirty(false); setEditingGradeId(undefined); setGradeEditSnapshot(undefined) }, [course.id])
  useEffect(() => { setSyllabusDraft(syllabus ?? blankSyllabus(course.id)); setGradesDraft(lossOnlyGrades(gradingItems, gradingDisplayMode)); setGradeTargetDraft(gradingTarget) }, [course.id, syllabus, gradingItems, gradingDisplayMode, gradingTarget])
  useEffect(() => {
    if (notes === course.notes) return
    const timer = setTimeout(() => onSaveCourse({ ...course, notes }), 650)
    return () => clearTimeout(timer)
  }, [notes, course, onSaveCourse])
  useLayoutEffect(() => {
    const textarea = notesRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const height = Math.min(220, Math.max(88, textarea.scrollHeight))
    textarea.style.height = `${height}px`
    textarea.style.overflowY = textarea.scrollHeight > 220 ? 'auto' : 'hidden'
  }, [notes, course.id, tab])
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
  const syllabusFields: Array<{ key: SyllabusFieldKey; label: string; placeholder: string }> = [
    { key:'rawSummary', label:t('courseSummary'), placeholder:t('summaryPlaceholder') },
    { key:'officeHours', label:t('officeHours'), placeholder:t('noDetailsYet') },
    { key:'attendancePolicy', label:t('attendancePolicy'), placeholder:t('noDetailsYet') },
    { key:'latePolicy', label:t('latePolicy'), placeholder:t('noDetailsYet') }
  ]
  const saveSyllabusField = (key: SyllabusFieldKey, result: SyllabusFieldResult) => {
    const next = { ...syllabusDraft, [key]:result.display,
      fieldResults:{ ...syllabusFieldResults(syllabusDraft), [key]:result } }
    setSyllabusDraft(next)
    onSaveSyllabus(next)
  }
  const setGradeValue = (index: number, patch: Partial<GradingItem>) => setGradesDraft((all) => all.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  const setPlannerGradeValue = (index: number, patch: Partial<GradingItem>) => {
    setGradeValue(index, patch)
    setGradePlanDirty(true)
  }
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
  const beginGradeEdit = (item: GradingItem) => {
    setEditingGradeId(item.id)
    setGradeEditSnapshot({ ...item })
  }
  const finishGradeEdit = () => {
    if (!editingGradeId) return
    setEditingGradeId(undefined)
    setGradeEditSnapshot(undefined)
    onSaveGrades(gradesDraft, gradeMode, gradeTarget)
  }
  const cancelGradeEdit = () => {
    if (!editingGradeId) return
    setGradesDraft((items) => gradeEditSnapshot
      ? items.map((item) => item.id === editingGradeId ? gradeEditSnapshot : item)
      : items.filter((item) => item.id !== editingGradeId))
    setEditingGradeId(undefined)
    setGradeEditSnapshot(undefined)
  }
  const removeGradeItem = (id: string) => {
    const next = gradesDraft.filter((item) => item.id !== id)
    setGradesDraft(next)
    setEditingGradeId(undefined)
    setGradeEditSnapshot(undefined)
    onSaveGrades(next, gradingModeFor(next, gradingDisplayMode), gradeTarget)
  }
  const addGradeItem = () => {
    const item: GradingItem = {
      id:crypto.randomUUID(), courseId:course.id, label:t('category'), weight:0, points:gradeMode === 'points' ? 0 : null,
      targetPoints:null, currentPoints:null, currentMode:'lost', userEdited:true
    }
    setGradesDraft((all) => [...all, item])
    setEditingGradeId(item.id)
    setGradeEditSnapshot(null)
  }
  const handleGradeEditKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') { event.preventDefault(); finishGradeEdit() }
    if (event.key === 'Escape') { event.preventDefault(); cancelGradeEdit() }
  }
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
          <textarea ref={notesRef} className="notes-area deadline-notes-area" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('notesPlaceholder')}/>
          <span className="save-state">{t('autosaves')}</span>
        </section>
        <section className="summary-card next-exam-card"><div className="next-exam-heading"><p className="eyebrow">{t('nextExam')}</p><button className="text-button" onClick={onAddExam}><Plus size={13}/>{t('addExam')}</button></div>{nextExam ? <button onClick={() => onOpenEvent(nextExam)}><strong>{nextExam.title}</strong><span>{eventDateTime(nextExam.dueAt, course.timezone, locale).toFormat('cccc, LLL d · h:mm a')}</span></button> : <p className="subtle">{t('noUpcomingExam')}</p>}</section>
      </aside>
    </div>}
    {tab === 'syllabus' && <div className="tab-content syllabus-layout">
      <section className="content-section"><div className="section-heading"><div><p className="eyebrow">{t('sourceDocument')}</p><h2>{t('syllabus')}</h2></div></div>
        <div className="syllabus-field-grid" style={courseColorVariableStyle(course.colorKey)}>{syllabusFields.map((field) => <SyllabusFieldCard
          key={`${course.id}:${field.key}`} label={field.label} placeholder={field.placeholder}
          result={syllabusFieldResults(syllabusDraft)[field.key]} sourceUnavailable={t('sourceUnavailable')}
          parsedAnswer={t('parsedAnswer')} manuallyCorrected={t('manuallyCorrected')} holdOriginal={t('holdOriginal')}
          cancelLabel={t('cancel')} pageLabel={(page) => locale === 'zh' ? `第 ${page} 页` : `Page ${page}`}
          onSave={(result) => saveSyllabusField(field.key, result)}/>)}</div>
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
          <div className="grade-editor">{gradesDraft.map((item, index) => <div className={`grade-breakdown-row ${editingGradeId === item.id ? 'editing' : ''}`} key={item.id}>
            {editingGradeId === item.id ? <div className="grade-edit-row" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) finishGradeEdit() }} onKeyDown={handleGradeEditKeyDown}>
              <input autoFocus aria-label={t('category')} value={item.label} onChange={(event) => setGradeValue(index, { label:event.target.value })}/>
              <div className="weight-input"><input aria-label={gradeMode === 'percentage' ? t('weight') : t('pointsShort')} type="number" min="0" max={gradeMode === 'percentage' ? 100 : undefined}
                value={gradeMode === 'percentage' ? item.weight : item.points ?? ''}
                onChange={(event) => setGradeValue(index, gradeMode === 'percentage' ? { weight:Number(event.target.value) } : { points:optionalNumber(event.target.value) })}/><span>{gradeMode === 'percentage' ? '%' : t('pointsShort')}</span></div>
              <button type="button" className="icon-button grade-remove-button" aria-label={t('remove')} onClick={() => removeGradeItem(item.id)}>×</button>
            </div> : <>
              <button type="button" className="grade-view-row" onClick={() => beginGradeEdit(item)}><span>{item.label}</span><strong>{score(gradeMode === 'percentage' ? item.weight : Number(item.points ?? 0))}{gradeMode === 'percentage' ? '%' : ` ${t('pointsShort')}`}</strong></button>
              <button type="button" className="icon-button grade-remove-button" aria-label={`${t('remove')}: ${item.label}`} onClick={() => removeGradeItem(item.id)}>×</button>
            </>}
          </div>)}</div>
          <button className="text-button" onClick={addGradeItem}><Plus size={14}/>{t('addCategory')}</button>
          <div className="grade-total"><span>{t('total')}</span><strong>{score(gradeMode === 'percentage' ? percentageTotal : pointsTotal)}{gradeMode === 'percentage' ? '%' : ` ${t('pointsShort')}`}</strong></div>
          <span className="save-state grade-breakdown-save-state">{t('autosaves')}</span>
        </> : <>
          <p className="grade-planner-hint">{t('scorePlannerHint')}</p>
          <div className="grade-projection-table">
            <div className="grade-projection-heading"><span>{t('category')}</span><span>{gradeMode === 'points' ? t('maxScore') : t('weight')}</span><span>{t('myExpectedScore')}</span><span>{t('contribution')}</span></div>
            <div className="grade-plan-list">{gradesDraft.map((item, index) => {
              const calculation = gradeContribution(item, gradeMode)
              const basis = gradeMode === 'points' ? Number(item.points ?? 0) : Number(item.weight || 0)
              const calculationDetail = calculation.earned === null ? '' : gradeMode === 'percentage' ? `${score(basis)}% × ${score(calculation.earned)}%` : `${score(calculation.earned)} / ${score(basis)} ${t('pointsShort')}`
              return <div className="grade-projection-row" key={item.id}>
                <strong title={item.label}>{item.label}</strong>
                <span className="grade-basis-value">{score(basis)}{gradeMode === 'points' ? ` ${t('pointsShort')}` : '%'}</span>
                <label className="grade-current-field"><span>{t('myExpectedScore')}</span><input aria-label={t('myExpectedScore')} type="number" min="0" max={gradeMode === 'points' ? Number(item.points ?? 0) || undefined : 100} value={item.currentPoints ?? ''} onChange={(event) => setPlannerGradeValue(index, { currentPoints:optionalNumber(event.target.value), currentMode:'lost' })}/></label>
                <span className="grade-contribution" title={calculationDetail}><span className="grade-contribution-label">{t('contribution')}</span><strong>{calculation.contribution === null ? '—' : `${preciseScore(calculation.contribution)}${gradeMode === 'points' ? ` ${t('pointsShort')}` : '%'}`}</strong>{calculationDetail && <small>{calculationDetail}</small>}</span>
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
const syllabusFieldResults = (syllabus: SyllabusInfo): Record<SyllabusFieldKey, SyllabusFieldResult> => ({
  rawSummary:syllabus.fieldResults?.rawSummary ?? { display:syllabus.rawSummary, type:'legacy', sources:[] },
  officeHours:syllabus.fieldResults?.officeHours ?? { display:syllabus.officeHours, type:'legacy', sources:[] },
  attendancePolicy:syllabus.fieldResults?.attendancePolicy ?? { display:syllabus.attendancePolicy, type:'legacy', sources:[] },
  latePolicy:syllabus.fieldResults?.latePolicy ?? { display:syllabus.latePolicy, type:'legacy', sources:[] }
})
const optionalNumber = (value: string) => value === '' ? null : Number(value)
const lossOnlyGrades = (items: GradingItem[], fallback: GradingMode) => toLossOnlyGradingItems(items, gradingModeFor(items, fallback))
