import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { SyllabusEvidenceSource, SyllabusFieldResult } from '../domain/types'
import { Modal } from './Modal'

export function SyllabusFieldCard({ label, placeholder, result, sourceUnavailable, parsedAnswer, manuallyCorrected,
  holdOriginal, cancelLabel, pageLabel, onSave }: {
  label: string; placeholder: string; result: SyllabusFieldResult
  sourceUnavailable: string; parsedAnswer: string; manuallyCorrected: string; holdOriginal: string; cancelLabel: string
  pageLabel: (page: number) => string; onSave: (result: SyllabusFieldResult) => void
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<{ kind: 'display' } | { kind: 'source'; index: number }>()
  const [draft, setDraft] = useState('')
  const [showingOriginal, setShowingOriginal] = useState<number>()

  const beginDisplayEdit = () => { setDraft(result.display); setEditing({ kind:'display' }) }
  const beginSourceEdit = (index: number) => {
    setDraft(result.sources[index].correctedText ?? result.sources[index].text)
    setEditing({ kind:'source', index })
  }
  const cancel = () => { setDraft(''); setEditing(undefined) }
  const commit = () => {
    if (!editing) return
    if (editing.kind === 'display') onSave({ ...result, display:draft, type:draft === result.display ? result.type : 'manual' })
    else {
      const source = result.sources[editing.index]
      const correctedText = draft === source.text ? undefined : draft
      const sources = result.sources.map((item, index) => index === editing.index
        ? { ...item, ...(correctedText === undefined ? { correctedText:undefined } : { correctedText }) } : item)
      onSave({ ...result, sources })
    }
    setEditing(undefined)
  }
  const editor = (value: string) => <div className="syllabus-inline-editor" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) commit()
  }}>
    <textarea autoFocus value={value} onFocus={(event) => resizeTextarea(event.currentTarget)}
      onChange={(event) => { setDraft(event.target.value); resizeTextarea(event.currentTarget) }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); cancel() }
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); commit() }
      }}/>
    <button type="button" className="syllabus-edit-cancel" onMouseDown={(event) => event.preventDefault()} onClick={cancel}>{cancelLabel}</button>
  </div>

  return <>
    <article className="syllabus-field-card">
    <button type="button" className="syllabus-field-toggle" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <span className="syllabus-field-heading"><strong>{label}</strong><ChevronRight size={16}/></span>
      <span className={`syllabus-field-preview ${result.display ? '' : 'empty'}`}>{result.display || placeholder}</span>
    </button>
    </article>
    {open && <Modal title={label} onClose={() => { setEditing(undefined); setOpen(false) }} wide className="syllabus-evidence-modal">
      <div className="syllabus-evidence-content">
        {result.sources.length ? result.sources.map((source, index) => <section className="syllabus-source-block" key={`${source.section}:${source.page}:${index}`}>
          <header><span>{source.section || label}{source.page !== null ? ` · ${pageLabel(source.page)}` : ''}</span>
            {source.correctedText !== undefined && <span className="syllabus-corrected-badge">{manuallyCorrected}</span>}</header>
          {editing?.kind === 'source' && editing.index === index ? editor(draft) : <>
            <button type="button" className="syllabus-source-text" onClick={() => beginSourceEdit(index)}>
              {renderHighlightedSource(source, showingOriginal === index)}
            </button>
            {source.correctedText !== undefined && <button type="button" className="syllabus-original-hold"
              onPointerDown={() => setShowingOriginal(index)} onPointerUp={() => setShowingOriginal(undefined)}
              onPointerCancel={() => setShowingOriginal(undefined)} onPointerLeave={() => setShowingOriginal(undefined)}
              onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') setShowingOriginal(index) }}
              onKeyUp={() => setShowingOriginal(undefined)} onBlur={() => setShowingOriginal(undefined)}>{holdOriginal}</button>}
          </>}
        </section>) : <p className="syllabus-source-unavailable">{sourceUnavailable}</p>}
        <section className="syllabus-answer-block">
          <header>{parsedAnswer}</header>
          {editing?.kind === 'display' ? editor(draft) : <button type="button" className={`syllabus-answer-text ${result.display ? '' : 'empty'}`} onClick={beginDisplayEdit}>{result.display || placeholder}</button>}
        </section>
      </div>
    </Modal>}
  </>
}

export function highlightedRangesForSource(source: SyllabusEvidenceSource, showOriginal = false) {
  if (showOriginal || source.correctedText === undefined) return validRanges(source.text, source.highlights)
  const ranges: Array<{ start: number; end: number }> = []
  let cursor = 0
  for (const original of validRanges(source.text, source.highlights)) {
    const phrase = source.text.slice(original.start, original.end)
    const start = source.correctedText.indexOf(phrase, cursor)
    if (start < 0) continue
    ranges.push({ start, end:start + phrase.length })
    cursor = start + phrase.length
  }
  return ranges
}

function renderHighlightedSource(source: SyllabusEvidenceSource, showOriginal: boolean) {
  const text = showOriginal || source.correctedText === undefined ? source.text : source.correctedText
  const ranges = highlightedRangesForSource(source, showOriginal)
  const parts: React.ReactNode[] = []
  let cursor = 0
  ranges.forEach((range, index) => {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start))
    parts.push(<mark key={`${range.start}:${range.end}:${index}`}>{text.slice(range.start, range.end)}</mark>)
    cursor = range.end
  })
  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts
}

function validRanges(text: string, ranges: Array<{ start: number; end: number }>) {
  const result: Array<{ start: number; end: number }> = []
  for (const range of ranges.filter((item) => Number.isInteger(item.start) && Number.isInteger(item.end)
    && item.start >= 0 && item.end > item.start && item.end <= text.length).sort((a, b) => a.start - b.start)) {
    const previous = result.at(-1)
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end)
    else result.push({ ...range })
  }
  return result
}

function resizeTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(200, Math.max(72, textarea.scrollHeight))}px`
}
