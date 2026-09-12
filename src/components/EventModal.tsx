import { useState } from 'react'
import type { AcademicEvent, Course, EventStatus, EventType } from '../domain/types'
import { defaultEventDueAt, fromDateTimeInput, toDateTimeInput } from '../domain/event/eventUtils'
import { Modal } from './Modal'
import { useI18n } from '../i18n'

const types: EventType[] = ['assignment','quiz','exam','lab','project','discussion','reading','lecture','office_hour','other']

export function EventModal({ event, courses, defaultCourseId, defaultType = 'assignment', onClose, onSave, onDelete, title }: {
  event?: AcademicEvent; courses: Course[]; defaultCourseId?: string; defaultType?: EventType; onClose: () => void
  onSave: (event: AcademicEvent) => void; onDelete?: () => void; title?: string
}) {
  const { t, courseName, eventType, status } = useI18n()
  const initialCourse = courses.find((c) => c.id === (event?.courseId ?? defaultCourseId)) ?? courses[0]
  const [value, setValue] = useState<AcademicEvent>(event ?? {
    id: crypto.randomUUID(), courseId: initialCourse?.id ?? '', title: '', type: defaultType,
    dueAt: defaultEventDueAt(initialCourse?.timezone ?? 'UTC'),
    dueTimezone: initialCourse?.timezone ?? 'UTC', status: 'not_done', sourceType: 'manual', sourceLabel: 'Manual'
  })
  const [localDue, setLocalDue] = useState(toDateTimeInput(value.dueAt, value.dueTimezone))
  const set = <K extends keyof AcademicEvent>(key: K, next: AcademicEvent[K]) => setValue((v) => ({ ...v, [key]: next }))
  const changeCourse = (courseId: string) => {
    const timezone = courses.find((c) => c.id === courseId)?.timezone ?? value.dueTimezone
    setValue((v) => ({ ...v, courseId, dueTimezone: timezone }))
  }
  return <Modal title={title ?? (event ? t('eventDetails') : t('addEvent'))} onClose={onClose} wide className="event-modal">
    <form className="event-form" onSubmit={(e) => { e.preventDefault(); onSave({ ...value, dueAt: fromDateTimeInput(localDue, value.dueTimezone), userEdited: Boolean(event) }) }}>
      <label>{t('title')}<input required autoFocus value={value.title} onChange={(e) => set('title', e.target.value)} placeholder="Homework 3"/></label>
      <div className="form-grid two event-course-grid">
        <label>{t('course')}<select required value={value.courseId} onChange={(e) => changeCourse(e.target.value)}>
          {courses.map((course) => <option key={course.id} value={course.id}>{course.code} — {courseName(course.name)}</option>)}
        </select></label>
        <label>{t('type')}<select value={value.type} onChange={(e) => set('type', e.target.value as EventType)}>
          {types.map((type) => <option key={type} value={type}>{eventType(type)}</option>)}
        </select></label>
      </div>
      <div className="form-grid two event-due-grid">
        <label>{t('dueDateTime')}<input required type="datetime-local" value={localDue} onChange={(e) => setLocalDue(e.target.value)}/></label>
        <label>{t('status')}<select value={value.status} onChange={(e) => set('status', e.target.value as EventStatus)}>
          <option value="not_done">{status('not_done')}</option><option value="in_progress">{status('in_progress')}</option><option value="done">{status('done')}</option>
        </select></label>
      </div>
      <div className="source-panel"><span className="eyebrow">{t('source')}</span><strong>{value.sourceLabel ?? value.sourceType}</strong>
        {value.rawSourceText ? <details><summary>{t('viewOriginal')}</summary><pre>{value.rawSourceText}</pre></details> : <p>{t('noOriginal')}</p>}
      </div>
      <div className="modal-actions">
        {event && onDelete ? <button type="button" className="button danger ghost" onClick={onDelete}>{t('deleteEvent')}</button> : <span/>}
        <div><button type="button" className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" type="submit">{t('saveEvent')}</button></div>
      </div>
    </form>
  </Modal>
}
