import { useState } from 'react'
import { AlertCircle, Check, ClipboardPaste, Inbox, Search, X } from 'lucide-react'
import { DateTime } from 'luxon'
import type { AcademicEvent, Course, DetectedEvent } from '../domain/types'
import { BrightspaceEmailParser } from '../integrations/email/BrightspaceEmailParser'
import { findLikelyDuplicate } from '../services/eventMatcher/eventMatcher'
import { courseColorClass, courseColorStyle } from '../domain/courseColor'
import { useI18n } from '../i18n'

const sample = `Activity summary for Fall 2026 STAT 350 Online Section - Merge

Quiz #3 - Due date is in 1 day

Due date:
Friday, September 18, 2026 11:59 PM EDT`

export function InboxPage({ courses, events, detected, onAddDetected, onConfirm, onIgnore, onEdit }: {
  courses: Course[]; events: AcademicEvent[]; detected: DetectedEvent[]
  onAddDetected: (item: DetectedEvent) => Promise<void>; onConfirm: (item: DetectedEvent) => void
  onIgnore: (item: DetectedEvent) => void; onEdit: (item: DetectedEvent) => void
}) {
  const { language, locale, t } = useI18n()
  const [text, setText] = useState('')
  const [message, setMessage] = useState<string>()
  const [importing, setImporting] = useState(false)
  const parse = async () => {
    setImporting(true); setMessage(undefined)
    try {
      const parser = new BrightspaceEmailParser()
      const results = parser.parse(text)
      if (!results.length) { setMessage(language === 'zh' ? '没有识别到 Brightspace 截止日期。请确认邮件包含课程代码、标题和“Due date:”行。' : 'No Brightspace deadline was recognized. Check that the email includes a course code, title, and “Due date:” line.'); return }
      for (const item of results) {
        const course = courses.find((c) => c.code.replace(/\s/g,'').toLowerCase() === item.courseCode?.replace(/\s/g,'').toLowerCase())
        await onAddDetected({ ...item, courseId: course?.id })
      }
      setText(''); setMessage(language === 'zh' ? `${results.length} 项内容已加入待检查列表。` : `${results.length} item${results.length === 1 ? '' : 's'} added for review.`)
    } finally { setImporting(false) }
  }
  return <div className="page inbox-page">
    <header className="page-header"><div><p className="eyebrow">{t('reviewQueue')}</p><h1>{t('inbox')}</h1><p className="subtitle">{t('inboxSubtitle')}</p></div></header>
    <div className="inbox-layout">
      <main><div className="section-heading"><div><h2>{detected.length} {t('detectedItems')}</h2><p className="subtle">{t('nothingAddedSilently')}</p></div></div>
        <div className="detected-list">{detected.map((item) => {
          const course = courses.find((c) => c.id === item.courseId)
          const duplicate = findLikelyDuplicate(item, events)
          const due = DateTime.fromISO(item.dueAt, { setZone: true }).setZone(item.dueTimezone).setLocale(locale)
          return <article className="detected-card" key={item.id}>
            <div className={`detected-stripe ${courseColorClass(course?.colorKey)}`} style={courseColorStyle(course?.colorKey)}/>
            <div className="detected-body"><div className="detected-head"><div><span className="course-tag">{course?.code ?? item.courseCode ?? 'Course not matched'}</span><h3>{item.title}</h3><p>{due.toFormat('cccc, LLLL d · h:mm a ZZZZ')}</p></div><span className="confidence">{Math.round((item.confidence ?? 0)*100)}% match</span></div>
              {duplicate && <div className="duplicate-warning"><AlertCircle size={15}/><span>{t('possibleDuplicate')} “{duplicate.title}”. {t('reviewBeforeConfirm')}</span></div>}
              <div className="source-line"><span>{t('source')}</span><strong>{item.sourceLabel}</strong></div>
              <div className="card-actions"><button className="button secondary" onClick={() => onIgnore(item)}><X size={15}/>{t('ignore')}</button><button className="button secondary" onClick={() => onEdit(item)}>{t('edit')}</button><button className="button primary" onClick={() => onConfirm(item)}><Check size={15}/>{t('confirm')}</button></div>
            </div>
          </article>
        })}{!detected.length && <div className="empty-state"><Inbox size={28}/><h3>{t('inboxClear')}</h3><p>{t('inboxClearHint')}</p></div>}</div>
      </main>
      <aside className="import-panel"><div className="panel-title"><span><ClipboardPaste size={17}/>{t('pasteEmail')}</span></div><p>{t('pasteEmailHint')}</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t('pastePlaceholder')}/>
        {message && <p className="import-message">{message}</p>}
        <div className="import-actions"><button className="text-button" onClick={() => setText(sample)}>{t('useSample')}</button><button className="button primary" disabled={!text.trim() || importing} onClick={parse}><Search size={15}/>{importing ? t('parsing') : t('detectDeadline')}</button></div>
      </aside>
    </div>
  </div>
}
