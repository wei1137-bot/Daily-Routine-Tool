import { useMemo, useRef, useState } from 'react'
import { CalendarRange, Check, ChevronDown, ImagePlus, Loader2, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import type { Course, CourseMeeting } from '../domain/types'
import { courseColorClass, courseColorStyle } from '../domain/courseColor'
import { useI18n } from '../i18n'
import { Modal } from '../components/Modal'

const dayKeys = ['monday','tuesday','wednesday','thursday','friday'] as const

export function SchedulePage({ courses, meetings, onSave }: {
  courses: Course[]; meetings: CourseMeeting[]; onSave: (meetings: CourseMeeting[], deletedIds: string[]) => Promise<void>
}) {
  const { language, t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepthRef = useRef(0)
  const [draft, setDraft] = useState<CourseMeeting[]>([])
  const [deletedIds, setDeletedIds] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [message, setMessage] = useState<string>()
  const groupedDraft = useMemo(() => groupMeetingsForEditor(draft), [draft])
  const beginEditing = () => {
    setDraft(createMeetingDraft(meetings))
    setDeletedIds([])
    setEditing(true)
    setMessage(undefined)
  }
  const recognize = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setMessage(t('scheduleImageOnly')); return }
    setBusy(true); setMessage(undefined)
    try {
      const result = await window.dailyRoutine.recognizeScheduleImage({ bytes:new Uint8Array(await file.arrayBuffer()), name:file.name })
      const next = result.meetings.map((item) => {
        const course = courses.find((candidate) => normalizeCode(candidate.code) === normalizeCode(item.courseCode))
        return { id:crypto.randomUUID(), courseId:course?.id ?? '', dayOfWeek:item.dayOfWeek, startTime:item.startTime,
          endTime:item.endTime, location:item.location, instructor:resolveRecognizedInstructor(item.instructor, course?.instructor), label:item.label,
          sourceType:'image_ocr', sourceImageName:item.sourceImageName } satisfies CourseMeeting
      })
      setDraft((current) => mergeMeetings(editing ? current : meetings, next)); setEditing(true)
      setImportOpen(false)
      const unmatched = next.filter((item) => !item.courseId).length
      setMessage(language === 'zh'
        ? `识别到 ${next.length} 节课${unmatched ? `，其中 ${unmatched} 节需要选择课程` : ''}。请检查后保存。`
        : `Recognized ${next.length} meeting${next.length === 1 ? '' : 's'}${unmatched ? `; ${unmatched} need a course selection` : ''}. Review before saving.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }
  const addMeeting = () => {
    const meeting = { id:crypto.randomUUID(), courseId:courses[0]?.id ?? '', dayOfWeek:1,
      startTime:'09:00', endTime:'09:50', location:'', instructor:'', label:'Lecture', sourceType:'manual' } satisfies CourseMeeting
    setDraft((current) => [...current, meeting])
  }
  const patchGroup = (key: string, values: Partial<CourseMeeting>) => setDraft((all) => all.map((item) => meetingEditorKey(item) === key ? { ...item, ...values } : item))
  const changeGroupDays = (key: string, days: number[]) => {
    const group = draft.filter((item) => meetingEditorKey(item) === key)
    if (!group.length || !days.length) return
    const removed = group.filter((item) => !days.includes(item.dayOfWeek) && meetings.some((saved) => saved.id === item.id)).map((item) => item.id)
    if (removed.length) setDeletedIds((all) => [...new Set([...all, ...removed])])
    const firstIndex = draft.findIndex((item) => meetingEditorKey(item) === key)
    const remaining = draft.filter((item) => meetingEditorKey(item) !== key)
    const representative = group[0]
    const next = [...new Set(days)].sort((a,b) => a-b).map((dayOfWeek) => group.find((item) => item.dayOfWeek === dayOfWeek)
      ?? { ...representative, id:crypto.randomUUID(), dayOfWeek, sourceType:'manual' as const })
    remaining.splice(Math.min(firstIndex,remaining.length),0,...next)
    setDraft(remaining)
  }
  const removeGroup = (key: string) => {
    const ids = draft.filter((item) => meetingEditorKey(item) === key).map((item) => item.id)
    setDraft((all) => all.filter((candidate) => meetingEditorKey(candidate) !== key))
    const persistedIds = ids.filter((id) => meetings.some((item) => item.id === id))
    if (persistedIds.length) setDeletedIds((all) => [...new Set([...all, ...persistedIds])])
  }
  const cancelEditing = () => { setDraft(createMeetingDraft(meetings)); setDeletedIds([]); setEditing(false); setMessage(undefined) }
  const save = async () => {
    if (!draft.length || draft.some((item) => !item.courseId)) return
    setSaving(true)
    try { await onSave(draft, deletedIds); setDeletedIds([]); setEditing(false); setMessage(t('scheduleSaved')) }
    finally { setSaving(false) }
  }
  const closeImport = () => { setImportOpen(false); setDragging(false); dragDepthRef.current = 0; setMessage(undefined) }
  return <div className="page schedule-page">
    <header className="page-header"><div><p className="eyebrow">{t('weeklyPlan')}</p><h1>{t('schedule')}</h1><p className="subtitle">{t('scheduleSubtitle')}</p></div>
      <div className="schedule-header-actions"><button className="button secondary" onClick={beginEditing}><Pencil size={16}/>{t('editSchedule')}</button><button className={`button ${meetings.length ? 'secondary' : 'primary'}`} onClick={() => { setMessage(undefined); if (meetings.length) setImportOpen(true); else inputRef.current?.click() }}><ImagePlus size={16}/>{t('importScheduleImage')}</button></div>
    </header>
    <input ref={inputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void recognize(event.target.files?.[0])}/>
    {!meetings.length ? <button type="button" className={`schedule-dropzone ${dragging ? 'dragging' : ''}`} disabled={busy} aria-busy={busy}
        onClick={() => { setMessage(undefined); inputRef.current?.click() }}
        onDragEnter={(event) => { event.preventDefault(); dragDepthRef.current += 1; setDragging(true) }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
        onDragLeave={(event) => { event.preventDefault(); dragDepthRef.current = Math.max(0, dragDepthRef.current - 1); if (!dragDepthRef.current) setDragging(false) }}
        onDrop={(event) => { event.preventDefault(); dragDepthRef.current = 0; setDragging(false); void recognize(event.dataTransfer.files[0]) }}>
        {busy ? <Loader2 className="spin" size={28}/> : <Upload size={28}/>}<strong>{busy ? t('recognizingSchedule') : t('dropSchedule')}</strong><span>{t('dropScheduleHint')}</span>
      </button> : <Timetable courses={courses} meetings={meetings}/>}
    {message && !editing && !importOpen && <p className="schedule-message">{message}</p>}
    {importOpen && <Modal title={t('importScheduleImage')} onClose={() => { if (!busy) closeImport() }} className="schedule-import-modal">
      <div className="schedule-import-modal-body">
        <div className={`schedule-import-dropzone ${dragging ? 'dragging' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); dragDepthRef.current += 1; setDragging(true) }}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
          onDragLeave={(event) => { event.preventDefault(); dragDepthRef.current = Math.max(0, dragDepthRef.current - 1); if (!dragDepthRef.current) setDragging(false) }}
          onDrop={(event) => { event.preventDefault(); dragDepthRef.current = 0; setDragging(false); void recognize(event.dataTransfer.files[0]) }}>
          {busy ? <Loader2 className="spin" size={34}/> : <Upload size={34}/>}<strong>{busy ? t('recognizingSchedule') : t('dropSchedule')}</strong><span>{t('dropScheduleHint')}</span>
          <button className="button primary" disabled={busy} onClick={() => inputRef.current?.click()}>{t('chooseScheduleImage')}</button>
        </div>
        {message && <p className="schedule-message">{message}</p>}
      </div>
    </Modal>}
    {editing && <Modal title={t('editSchedule')} onClose={cancelEditing} wide className="schedule-editor-modal">
      <div className="schedule-editor-body">
        {message && <p className="schedule-message">{message}</p>}
        <div className="schedule-review-list">{groupedDraft.map((group) => { const item = group.meetings[0]; return <div className="schedule-review-row" key={group.key}>
        <select aria-label={t('course')} value={item.courseId} onChange={(event) => patchGroup(group.key,{courseId:event.target.value})}><option value="">{t('selectCourse')}</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.code}</option>)}</select>
        <ScheduleDayPicker days={group.days} onChange={(days) => changeGroupDays(group.key,days)}/>
        <input aria-label={t('startTime')} type="time" value={item.startTime} onChange={(event) => patchGroup(group.key,{startTime:event.target.value})}/>
        <input aria-label={t('endTime')} type="time" value={item.endTime} onChange={(event) => patchGroup(group.key,{endTime:event.target.value})}/>
        <input aria-label={t('location')} value={item.location} onChange={(event) => patchGroup(group.key,{location:event.target.value})} placeholder={t('location')}/>
        <input aria-label={t('instructor')} value={item.instructor} onChange={(event) => patchGroup(group.key,{instructor:event.target.value})} placeholder={t('instructor')}/>
        <input aria-label={t('classType')} value={item.label} onChange={(event) => patchGroup(group.key,{label:event.target.value})} placeholder={t('classType')}/>
        <button className="icon-button" aria-label={t('remove')} onClick={() => removeGroup(group.key)}><Trash2 size={15}/></button>
      </div>})}{!draft.length && <div className="empty-state compact"><CalendarRange size={24}/><p>{t('noClassesRecognized')}</p></div>}
        <button className="schedule-add-row" onClick={addMeeting}><Plus size={16}/><span>{t('addClass')}</span></button>
      </div>
      </div>
      <footer className="schedule-editor-actions"><button className="button secondary" disabled={saving} onClick={cancelEditing}>{t('cancel')}</button><button className="button primary" disabled={saving || !draft.length || draft.some((item) => !item.courseId)} onClick={() => void save()}>{saving ? <Loader2 className="spin" size={15}/> : <Check size={15}/>} {t('saveSchedule')}</button></footer>
    </Modal>}
  </div>
}

function ScheduleDayPicker({ days, onChange }: { days: number[]; onChange: (days: number[]) => void }) {
  const { language, t } = useI18n()
  const selected = [...days].sort((a,b) => a-b)
  const label = selected.map((day) => t(dayKeys[day-1])).join(language === 'zh' ? '、' : ', ')
  const toggle = (day: number) => {
    const checked = selected.includes(day)
    if (checked && selected.length === 1) return
    onChange(checked ? selected.filter((item) => item !== day) : [...selected,day])
  }
  return <details className="schedule-day-picker">
    <summary aria-label={t('day')}><span>{label}</span><ChevronDown size={14}/></summary>
    <div className="schedule-day-menu">{dayKeys.map((day,index) => { const value=index+1; const checked=selected.includes(value); return <label className={checked ? 'selected' : ''} key={day}>
      <input type="checkbox" checked={checked} disabled={checked && selected.length === 1} onChange={() => toggle(value)}/><span>{t(day)}</span>
    </label> })}</div>
  </details>
}

function Timetable({ courses, meetings }: { courses: Course[]; meetings: CourseMeeting[] }) {
  const { locale, t } = useI18n()
  const range = useMemo(() => {
    if (!meetings.length) return { start:8 * 60, end:18 * 60 }
    const starts = meetings.map((item) => toMinutes(item.startTime))
    const ends = meetings.map((item) => toMinutes(item.endTime))
    let start = Math.max(0, Math.floor(Math.min(...starts) / 60) * 60 - 60)
    let end = Math.min(24 * 60, Math.ceil(Math.max(...ends) / 60) * 60 + 60)
    if (end - start < 6 * 60) {
      const padding = (6 * 60 - (end - start)) / 2
      start = Math.max(0, start - padding); end = Math.min(24 * 60, end + padding)
    }
    return { start, end }
  }, [meetings])
  const hourMarks = Array.from({ length:Math.ceil((range.end-range.start)/60)+1 },(_,index) => range.start + index*60)
  const position = (minutes: number) => `${(minutes-range.start)/(range.end-range.start)*100}%`
  return <section className="timetable-shell">
    <div className="timetable-corner"/>{dayKeys.map((day) => <div className="timetable-day-heading" key={day}>{t(day)}</div>)}
    <div className="timetable-hours">{hourMarks.map((minutes) => <span key={minutes} style={{top:position(minutes)}}>{formatTime(minutes,locale)}</span>)}</div>
    {dayKeys.map((day,index) => <div className="timetable-day" key={day}>{hourMarks.map((minutes) => <span className="timetable-gridline" key={minutes} style={{top:position(minutes)}}/>)}
      {meetings.filter((item) => item.dayOfWeek === index+1).map((item) => { const course=courses.find((candidate)=>candidate.id===item.courseId); const duration=toMinutes(item.endTime)-toMinutes(item.startTime); const top=position(toMinutes(item.startTime)); const cardHeight=`${duration/(range.end-range.start)*100}%`
        const displayLabel = item.label === 'Lecture' ? t('lecture') : item.label === 'Lab' ? t('lab') : item.label
        const expanded = duration > 60
        return <article className={`schedule-class ${expanded ? 'expanded' : 'short'} ${courseColorClass(course?.colorKey)}`} style={{...courseColorStyle(course?.colorKey),top,height:cardHeight}} key={item.id} title={`${course?.code ?? ''} ${displayLabel}\n${item.startTime}–${item.endTime}${item.location ? `\n${item.location}` : ''}${item.instructor ? `\n${item.instructor}` : ''}`}><div><strong>{course?.code ?? t('selectCourse')}</strong><span>{displayLabel}</span></div><div className="schedule-class-meta"><small className="schedule-class-time">{formatTime(toMinutes(item.startTime),locale)}–{formatTime(toMinutes(item.endTime),locale)}</small>{!expanded && item.location && <small className="schedule-class-location">· {item.location}</small>}</div>{expanded && item.location && <small className="schedule-class-location expanded-location">{item.location}</small>}</article> })}
    </div>)}
  </section>
}

function normalizeCode(value: string) { return value.replace(/[^a-z0-9]/gi,'').toLowerCase() }
export function resolveRecognizedInstructor(recognized: string, saved?: string) {
  const detected = recognized.trim()
  const known = String(saved ?? '').replace(/^Instructor\s*:\s*/i, '').trim()
  return !detected || /^[a-z]{1,3}$/i.test(detected) ? known : detected
}
export function createMeetingDraft(meetings: CourseMeeting[]) { return meetings.map((item) => ({ ...item })) }
export function groupMeetingsForEditor(meetings: CourseMeeting[]) {
  const groups = new Map<string, CourseMeeting[]>()
  for (const meeting of meetings) {
    const key = meetingEditorKey(meeting)
    const group = groups.get(key)
    if (group) group.push(meeting)
    else groups.set(key,[meeting])
  }
  return [...groups].map(([key,items]) => ({ key, meetings:items, days:[...new Set(items.map((item) => item.dayOfWeek))].sort((a,b) => a-b) }))
}
export function mergeMeetings(existing: CourseMeeting[], incoming: CourseMeeting[]) {
  const merged = existing.map((item) => ({ ...item }))
  const keys = new Set(merged.map(meetingKey))
  for (const item of incoming) {
    const key = meetingKey(item)
    if (!keys.has(key)) { merged.push(item); keys.add(key) }
  }
  return merged
}
function meetingKey(item: CourseMeeting) { return `${item.courseId}|${item.dayOfWeek}|${item.startTime}|${item.endTime}` }
function meetingEditorKey(item: CourseMeeting) { return `${item.courseId}|${item.startTime}|${item.endTime}` }
function toMinutes(value: string) { const [hours,minutes]=value.split(':').map(Number); return hours*60+minutes }
function formatTime(minutes: number, locale: string) { const hours=Math.floor(minutes/60); const mins=minutes%60; return new Intl.DateTimeFormat(locale,{hour:'numeric',minute:mins?'2-digit':undefined}).format(new Date(2026,0,1,hours,mins)) }
