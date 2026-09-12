import { useState } from 'react'
import type { Course } from '../domain/types'
import { isCustomCourseColor } from '../domain/courseColor'
import { useI18n } from '../i18n'
import { Modal } from './Modal'

const colors = ['blue','violet','amber','rose','teal','green']

export function CourseModal({ course, onClose, onSave, onDelete, defaultTimezone = 'America/Indiana/Indianapolis', defaultTerm = 'Fall 2026' }: {
  course?: Course; onClose: () => void; onSave: (course: Course) => void; onDelete?: () => void
  defaultTimezone?: string; defaultTerm?: string
}) {
  const { t } = useI18n()
  const [value, setValue] = useState<Course>(course ?? {
    id: crypto.randomUUID(), code: '', name: '', instructor: '', term: defaultTerm,
    colorKey: 'blue', timezone: defaultTimezone, notes: ''
  })
  const update = (key: keyof Course, next: string) => setValue((v) => ({ ...v, [key]: next }))
  return <Modal title={course ? t('editCourse') : t('addCourse')} onClose={onClose}>
    <form onSubmit={(e) => { e.preventDefault(); if (value.code.trim()) onSave(value) }}>
      <div className="form-grid two">
        <label>{t('courseCode')}<input required autoFocus value={value.code} onChange={(e) => update('code', e.target.value)} placeholder="CS 240"/></label>
        <label>{t('term')}<input value={value.term} onChange={(e) => update('term', e.target.value)} placeholder="Fall 2026"/></label>
      </div>
      <label>{t('courseName')}<input value={value.name} onChange={(e) => update('name', e.target.value)} placeholder="Programming in C"/></label>
      <label>{t('instructor')}<input value={value.instructor} onChange={(e) => update('instructor', e.target.value)} placeholder={t('instructorName')}/></label>
      <label>{t('courseTimezone')}<select value={value.timezone} onChange={(e) => update('timezone', e.target.value)}>
        <option>America/Indiana/Indianapolis</option><option>America/New_York</option><option>America/Chicago</option>
        <option>America/Denver</option><option>America/Los_Angeles</option><option>Asia/Shanghai</option><option>UTC</option>
      </select></label>
      <fieldset className="color-picker"><legend>{t('courseColor')}</legend><div className="color-options">{colors.map((color) => <button type="button" key={color} aria-label={color}
        className={`color-choice ${color} ${value.colorKey === color ? 'selected' : ''}`} onClick={() => update('colorKey', color)}/>)}
        <label className={`custom-color-control ${isCustomCourseColor(value.colorKey) ? 'selected' : ''}`} title={t('custom')}>
          <span className="custom-color-swatch" style={isCustomCourseColor(value.colorKey) ? { background:value.colorKey } : undefined}/><span>{t('custom')}</span>
          <input className="custom-color-input" type="color" aria-label={t('custom')} value={isCustomCourseColor(value.colorKey) ? value.colorKey : '#536faf'} onChange={(event) => update('colorKey', event.target.value)}/>
        </label>
      </div></fieldset>
      <div className="modal-actions">
        {course && onDelete ? <button type="button" className="button danger ghost" onClick={onDelete}>{t('deleteCourse')}</button> : <span/>}
        <div><button type="button" className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" type="submit">{t('saveCourse')}</button></div>
      </div>
    </form>
  </Modal>
}
