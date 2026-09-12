import { useMemo, useRef, useState } from 'react'
import { CalendarRange, Check, ImagePlus, Loader2, Plus, Trash2, Upload } from 'lucide-react'
import type { Course, CourseMeeting } from '../domain/types'
import { courseColorClass, courseColorStyle } from '../domain/courseColor'
import { useI18n } from '../i18n'

const dayKeys = ['monday','tuesday','wednesday','thursday','friday'] as const

export function SchedulePage({ courses, meetings, onSave }: {
  courses: Course[]; meetings: CourseMeeting[]; onSave: (meetings: CourseMeeting[], deletedIds: string[]) => Promise<void>
}) {
  const { language, t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<CourseMeeting[]>([])
  const [deletedIds, setDeletedIds] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [message, setMessage] = useState<string>()
  const shown = editing ? draft : meetings
  const recognize = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setMessage(t('scheduleImageOnly')); return }
    setBusy(true); setMessage(undefined)
    try {
      const result = await window.dailyRoutine.recognizeScheduleImage({ bytes:new Uint8Array(await file.arrayBuffer()), name:file.name })
      const next = result.meetings.map((item) => {
        const course = courses.find((candidate) => normalizeCode(candidate.code) === normalizeCode(item.courseCode))
        return { id:crypto.randomUUID(), courseId:course?.id ?? '', dayOfWeek:item.dayOfWeek, startTime:item.startTime,
          endTime:item.endTime, location:item.location, instructor:item.instructor, label:item.label,
          sourceType:'image_ocr', sourceImageName:item.sourceImageName } satisfies CourseMeeting
      })
      setDraft((current) => mergeMeetings(editing ? current : meetings, next)); setEditing(true)
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
    setDraft((current) => [...(editing ? current : meetings), meeting])
    if (!editing) setDeletedIds([])
    setEditing(true)
  }
  const patch = (id: string, values: Partial<CourseMeeting>) => setDraft((all) => all.map((item) => item.id === id ? { ...item, ...values } : item))
  const removeMeeting = (id: string) => {
    setDraft((all) => all.filter((candidate) => candidate.id !== id))
    if (meetings.some((item) => item.id === id)) setDeletedIds((all) => all.includes(id) ? all : [...all,id])
  }
  const cancelEditing = () => { setDraft(meetings.map((item) => ({ ...item }))); setDeletedIds([]); setEditing(false); setMessage(undefined) }
  const save = async () => {
    if (!draft.length || draft.some((item) => !item.courseId)) return
    setSaving(true)
    try { await onSave(draft, deletedIds); setDeletedIds([]); setEditing(false); setMessage(t('scheduleSaved')) }
    finally { setSaving(false) }
  }
  return <div className={`page schedule-page ${editing ? 'reviewing' : ''}`}>
    <header className="page-header"><div><p className="eyebrow">{t('weeklyPlan')}</p><h1>{t('schedule')}</h1><p className="subtitle">{t('scheduleSubtitle')}</p></div>
      <div className="schedule-header-actions"><button className="button secondary" onClick={addMeeting}><Plus size={16}/>{t('addClass')}</button><button className="button primary" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? <Loader2 className="spin" size={16}/> : <ImagePlus size={16}/>} {busy ? t('recognizingSchedule') : t('importScheduleImage')}</button></div>
      <input ref={inputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void recognize(event.target.files?.[0])}/>
    </header>
    {!meetings.length && !editing ? <button className={`schedule-dropzone ${dragging ? 'dragging' : ''}`}
      onClick={() => inputRef.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void recognize(event.dataTransfer.files[0]) }}>
      <Upload size={28}/><strong>{t('dropSchedule')}</strong><span>{t('dropScheduleHint')}</span>
    </button> : <Timetable courses={courses} meetings={shown}/>} 
    {message && <p className="schedule-message">{message}</p>}
    {editing && <section className="schedule-review">
      <div className="section-heading"><div><p className="eyebrow">{t('recognizedClasses')}</p><h2>{t('reviewSchedule')}</h2></div><div className="schedule-review-actions"><button className="button secondary" disabled={saving} onClick={cancelEditing}>{t('cancel')}</button><button className="button primary" disabled={saving || !draft.length || draft.some((item) => !item.courseId)} onClick={() => void save()}>{saving ? <Loader2 className="spin" size={15}/> : <Check size={15}/>} {t('saveSchedule')}</button></div></div>
      <div className="schedule-review-list">{draft.map((item) => <div className="schedule-review-row" key={item.id}>
        <select aria-label={t('course')} value={item.courseId} onChange={(event) => patch(item.id,{courseId:event.target.value})}><option value="">{t('selectCourse')}</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.code}</option>)}</select>
        <select aria-label={t('day')} value={item.dayOfWeek} onChange={(event) => patch(item.id,{dayOfWeek:Number(event.target.value)})}>{dayKeys.map((day,index) => <option value={index+1} key={day}>{t(day)}</option>)}</select>
        <input aria-label={t('startTime')} type="time" value={item.startTime} onChange={(event) => patch(item.id,{startTime:event.target.value})}/>
        <input aria-label={t('endTime')} type="time" value={item.endTime} onChange={(event) => patch(item.id,{endTime:event.target.value})}/>
        <input aria-label={t('location')} value={item.location} onChange={(event) => patch(item.id,{location:event.target.value})} placeholder={t('location')}/>
        <input aria-label={t('instructor')} value={item.instructor} onChange={(event) => patch(item.id,{instructor:event.target.value})} placeholder={t('instructor')}/>
        <input aria-label={t('classType')} value={item.label} onChange={(event) => patch(item.id,{label:event.target.value})} placeholder={t('classType')}/>
        <button className="icon-button" aria-label={t('remove')} onClick={() => removeMeeting(item.id)}><Trash2 size={15}/></button>
      </div>)}{!draft.length && <div className="empty-state compact"><CalendarRange size={24}/><p>{t('noClassesRecognized')}</p></div>}</div>
    </section>}
  </div>
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
function toMinutes(value: string) { const [hours,minutes]=value.split(':').map(Number); return hours*60+minutes }
function formatTime(minutes: number, locale: string) { const hours=Math.floor(minutes/60); const mins=minutes%60; return new Intl.DateTimeFormat(locale,{hour:'numeric',minute:mins?'2-digit':undefined}).format(new Date(2026,0,1,hours,mins)) }
