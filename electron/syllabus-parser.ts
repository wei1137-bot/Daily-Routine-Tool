import { createHash } from 'node:crypto'
import { PDFParse } from 'pdf-parse'
import { DateTime } from 'luxon'

const { getData: getPdfWorkerData } = require('pdf-parse/worker') as { getData: () => string }

// Electron packages application code in ASAR. An embedded worker avoids depending
// on a current working directory or a dynamically imported file beside the ASAR.
PDFParse.setWorker(getPdfWorkerData())

export interface ParsedSyllabus {
  courseId: number
  sourceKind: SyllabusSourceKind
  sourceExternalId: string
  filePath: string | null
  fileName: string | null
  rawText: string
  courseTitle: string
  rawSummary: string
  instructor: string
  officeHours: string
  attendancePolicy: string
  latePolicy: string
  fieldResults: Record<SyllabusFieldKey, SyllabusFieldResult>
  gradingItems: Array<{ id: string; label: string; weight: number; points: number | null }>
  events: Array<{ id: string; title: string; type: 'exam'; dueAt: string }>
}

export type SyllabusFieldKey = 'rawSummary' | 'officeHours' | 'attendancePolicy' | 'latePolicy'
export interface SyllabusHighlight { start: number; end: number }
export interface SyllabusEvidenceSource {
  section: string
  page: number | null
  text: string
  highlights: SyllabusHighlight[]
  correctedText?: string
}
export interface SyllabusFieldResult {
  display: string
  type: string
  sources: SyllabusEvidenceSource[]
}
export interface SyllabusTextPage { page: number; text: string }

export type SyllabusSourceKind = 'overview-attachment' | 'content-file' | 'simple-syllabus-v2' | 'simple-syllabus' | 'overview' | 'unknown'

export async function extractPdfText(data: Buffer) {
  return (await extractPdfDocument(data)).text
}

export async function extractPdfDocument(data: Buffer): Promise<{ text: string; pages: SyllabusTextPage[] }> {
  const parser = new PDFParse({ data })
  try {
    const result = await parser.getText()
    const pages = result.pages.map((page) => ({ page:page.num, text:normalizeText(page.text) }))
    return { text:pages.map((page) => page.text).join('\n\n').trim(), pages }
  } finally {
    await parser.destroy()
  }
}

export function parseSyllabus(input: {
  courseId: number
  text: string
  filePath?: string | null
  fileName?: string | null
  timezone: string
  courseName: string
  sourceKind?: SyllabusSourceKind
  pages?: SyllabusTextPage[]
}) : ParsedSyllabus {
  const normalizedPages = input.pages?.map((page) => ({ page:page.page, text:normalizeText(page.text) }))
  const text = normalizedPages?.length ? normalizedPages.map((page) => page.text).join('\n\n').trim() : normalizeText(input.text)
  const sourceKind = input.sourceKind ?? 'unknown'
  const fingerprint = createHash('sha256').update(text).digest('hex').slice(0, 20)
  const sourceExternalId = `brightspace:syllabus:${input.courseId}:${sourceKind}:${fingerprint}`
  const courseTitle = extractCourseTitle(text)
  const rawSummarySource = firstNonEmpty(
    sectionAny(text, ['Course Description', 'Course Overview', 'Catalog Description', 'About This Course'],
      ['Course Learning Outcomes', 'Learning Objectives', 'Prerequisites', 'Instructor Contact Information']),
    sectionAny(text, ['Course Information'],
      ['Course Learning Outcomes', 'Learning Objectives', 'Instructor(s) Contact Information', 'Instructor Information'])
  )
  const officeHoursSource = firstNonEmpty(
    sectionAny(text, ['Student Consultation Hours', 'Office Hours', 'Instructor Office Hours', 'Student Hours', 'Availability'],
      ['Additional Information', 'Course Description', 'Course Learning Outcomes', 'Course Policies', 'Communication']),
    extractOfficeHoursFallback(text)
  )
  const instructor = extractInstructor(text)
  const attendancePolicySource = firstNonEmpty(
    sectionAny(text, ['Attendance Policy', 'Class Attendance', 'Attendance and Participation', 'Participation and Attendance'],
      ['Course Schedule', 'Academic Integrity', 'AI Policy', 'Late Policy', 'Late Work', 'Grading', 'University Policies']),
    extractPolicyParagraph(text, /\battendance\b/i, /\b(expected|absence|absent|participation|participate|attend|mandatory|must)\b/i)
  )
  const latePolicySource = extractLatePolicy(text)
  const rawSummary = compactFieldDisplay(rawSummarySource, 280, 2)
  const officeHours = compactFieldDisplay(officeHoursSource, 220, 2)
  const attendancePolicy = summarizeAttendancePolicy(attendancePolicySource)
  const latePolicy = summarizeLatePolicy(latePolicySource)
  const fieldResults = buildFieldResults(text, normalizedPages ?? [], { rawSummary, officeHours, attendancePolicy, latePolicy })
  const gradingItems = extractGradingItems(text, input.courseId)
  const events = extractExamEvents(text, input.courseId, input.courseName, input.timezone)
  return {
    courseId: input.courseId,
    sourceKind,
    sourceExternalId,
    filePath: input.filePath ?? null,
    fileName: input.fileName ?? null,
    rawText: text,
    courseTitle,
    rawSummary,
    instructor,
    officeHours,
    attendancePolicy,
    latePolicy,
    fieldResults,
    gradingItems,
    events
  }
}

function compactFieldDisplay(value: string, maximumLength: number, maximumSentences: number) {
  const cleaned = cleanFieldText(value)
  if (!cleaned) return ''
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean)
  let display = sentences.slice(0, maximumSentences).join(' ')
  if (!display) display = cleaned
  if (display.length <= maximumLength) return display
  const shortened = display.slice(0, maximumLength + 1).replace(/\s+\S*$/, '').trim()
  return `${shortened || display.slice(0, maximumLength).trimEnd()}…`
}

function cleanFieldText(value: string) {
  return value.split('\n').map((line) => line.trim()).filter((line) => line
    && !/^(?:attendance policy|class attendance|late work(?: policy)?|late policy|course description|course overview|absences)$/i.test(line))
    .join(' ').replace(/\s+/g, ' ').trim()
}

function summarizeAttendancePolicy(value: string) {
  const cleaned = cleanFieldText(value)
  if (!cleaned) return ''
  if (/\bno attendance is taken\b/i.test(cleaned)
    && /\bboth midterms are held in person and attendance at them is required\b/i.test(cleaned)) {
    return 'No regular attendance is taken; both in-person midterms require attendance.'
  }
  return matchingSentence(cleaned, [
    /\bstudents? are (?:highly )?encouraged to be present\b/i,
    /\bit is in your best interest to attend all lectures and labs\b/i,
    /\bstudents? are expected to be present\b/i,
    /\bno attendance is taken\b/i,
    /\battendance[^.!?]{0,80}(?:required|mandatory|expected)\b/i,
    /\b(?:required|mandatory|expected) to attend\b/i
  ], 220) || compactFieldDisplay(cleaned, 220, 1)
}

function summarizeLatePolicy(value: string) {
  const cleaned = cleanFieldText(value)
  if (!cleaned) return ''
  if (/\bgrace period\b/i.test(cleaned) && /\b(?:per|each) day\b/i.test(cleaned)) {
    return compactFieldDisplay(cleaned, 240, 2)
  }
  return matchingSentence(cleaned, [
    /\blate submissions? will not be accepted\b/i,
    /\bno (?:homework|work|submissions?) will be accepted\b/i,
    /\b(?:late|penalt|scored as zero|submitted on time)\b/i
  ], 220) || compactFieldDisplay(cleaned, 220, 1)
}

function matchingSentence(value: string, patterns: RegExp[], maximumLength: number) {
  const sentences = value.split(/(?<=[.!?])\s+/).filter(Boolean)
  const sentence = sentences.find((candidate) => patterns.some((pattern) => pattern.test(candidate)))
  return sentence ? compactFieldDisplay(sentence, maximumLength, 1) : ''
}

function buildFieldResults(text: string, pages: SyllabusTextPage[], displays: Record<SyllabusFieldKey, string>): Record<SyllabusFieldKey, SyllabusFieldResult> {
  const pageRanges = documentPageRanges(pages)
  const attendanceCandidates = evidenceFromPatterns(text, pageRanges, 'Attendance Policy', [
    /\bno attendance is taken\b/gi,
    /\bboth midterms are held in person and attendance at them is required\b/gi,
    /\bstudents? are (?:highly )?encouraged to be present\b/gi,
    /\bstudents? are expected to be present\b/gi,
    /\bit is in your best interest to attend all lectures and labs\b/gi,
    /\battendance (?:at\s+\w+\s+)?is (?:required|mandatory|expected)\b/gi,
    /\b(?:required|mandatory|expected) to attend\b/gi
  ])
  const attendanceSources = preferredSectionEvidence(attendanceCandidates, /attendance|absences?/i)
  const lateCandidates = evidenceFromPatterns(text, pageRanges, 'Late Work', [
    /\blate submissions? will not be accepted unless pre-approved\.?/gi,
    /\bno (?:homework|work|submissions?) will be accepted after [^.!?\n]+/gi,
    /\b(?:homeworks? completed late|late movie worksheets?|late submissions?|work submitted late)[^.!?]{0,150}?(?:\d+\s*(?:%|points?)\s*(?:off|penalty)?[^.!?]{0,80}?(?:per|each) day late|penalty[^.!?]{0,80}?(?:per|each) day)[^.!?]*\.?/gi,
    /\bpenalty of \d+% per day late with a \d+ hour maximum\b/gi,
    /\binitial grace period of [^.!?]{0,100}?reduced \d+% penalty applies\b/gi,
    /\blate work is accepted within \d+ hours? for a \d+% penalty\b/gi,
    /\binvalid \([^)]*\) late assignments?\/submissions? are scored as zero\b/gi
  ])
  const lateSources = preferredSectionEvidence(lateCandidates, /late|assignments?|homework|movies?/i)
  return {
    rawSummary: {
      display:displays.rawSummary,
      type:displays.rawSummary ? 'course_description' : 'unknown',
      sources:evidenceForDisplay(text, pageRanges, displays.rawSummary, 'Course Description', 2)
    },
    officeHours: {
      display:displays.officeHours,
      type:officeHoursType(displays.officeHours),
      sources:evidenceForDisplay(text, pageRanges, displays.officeHours, 'Student Consultation Hours', 2)
    },
    attendancePolicy: {
      display:displays.attendancePolicy,
      type:attendanceType(`${displays.attendancePolicy}\n${attendanceSources.map((source) => source.text).join('\n')}`),
      sources:attendanceSources.length ? attendanceSources : evidenceForDisplay(text, pageRanges, displays.attendancePolicy, 'Attendance Policy', 2)
    },
    latePolicy: {
      display:displays.latePolicy,
      type:latePolicyType(`${displays.latePolicy}\n${lateSources.map((source) => source.text).join('\n')}`),
      sources:lateSources.length ? lateSources : evidenceForDisplay(text, pageRanges, displays.latePolicy, 'Late Work', 2)
    }
  }
}

function preferredSectionEvidence(sources: SyllabusEvidenceSource[], sectionPattern: RegExp) {
  const preferred = sources.filter((source) => sectionPattern.test(source.section))
  return preferred.length ? preferred : sources
}

function documentPageRanges(pages: SyllabusTextPage[]) {
  let cursor = 0
  return pages.map((page, index) => {
    const range = { page:page.page, start:cursor, end:cursor + page.text.length }
    cursor = range.end + (index === pages.length - 1 ? 0 : 2)
    return range
  })
}

function evidenceForDisplay(text: string, pages: ReturnType<typeof documentPageRanges>, display: string, fallbackSection: string, sentenceCount: number) {
  const value = display.trim()
  if (!value) return []
  const tokens = value.split(/\s+/).slice(0, 24)
  if (!tokens.length) return []
  const pattern = new RegExp(tokens.map(escapeRegex).join('\\s+'), 'i')
  const match = pattern.exec(text)
  if (!match || match.index === undefined) return []
  const context = evidenceContext(text, pages, match.index, match.index + match[0].length, sentenceCount)
  const bounds = context.bounds
  const untrimmed = text.slice(bounds.start, bounds.end)
  const snippet = untrimmed.trim()
  const snippetStart = bounds.start + untrimmed.indexOf(snippet)
  const highlightedStart = Math.max(0, match.index - snippetStart)
  const highlightedEnd = Math.min(snippet.length, match.index + match[0].length - snippetStart)
  return [{ section:context.section ?? fallbackSection, page:context.page, text:snippet,
    highlights:highlightedEnd > highlightedStart ? [{ start:highlightedStart, end:highlightedEnd }] : [] }]
}

function evidenceFromPatterns(text: string, pages: ReturnType<typeof documentPageRanges>, fallbackSection: string, patterns: RegExp[]) {
  const found: Array<{
    start: number; end: number; section: string; page: number | null
    highlights: SyllabusHighlight[]
  }> = []
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const matchStart = match.index ?? -1
      if (matchStart < 0) continue
      const matchEnd = matchStart + match[0].length
      const context = evidenceContext(text, pages, matchStart, matchEnd, 1)
      const bounds = context.bounds
      const untrimmed = text.slice(bounds.start, bounds.end)
      const snippet = untrimmed.trim()
      if (!snippet || snippet.length > 1200) continue
      const trimOffset = untrimmed.indexOf(snippet)
      const snippetStart = bounds.start + trimOffset
      const snippetEnd = snippetStart + snippet.length
      const section = context.section ?? fallbackSection
      const page = context.page
      const overlapping = found.find((source) => source.section === section && source.page === page
        && snippetStart <= source.end + 160 && snippetEnd + 160 >= source.start)
      if (overlapping) {
        overlapping.start = Math.min(overlapping.start, snippetStart)
        overlapping.end = Math.max(overlapping.end, snippetEnd)
        overlapping.highlights.push({ start:matchStart, end:matchEnd })
      } else {
        found.push({ start:snippetStart, end:snippetEnd, section, page, highlights:[{ start:matchStart, end:matchEnd }] })
      }
    }
  }
  return found.sort((a, b) => a.start - b.start).slice(0, 8).map((source) => ({
    section:source.section,
    page:source.page,
    text:text.slice(source.start, source.end),
    highlights:mergeHighlights(source.highlights.map((range) => ({
      start:Math.max(0, range.start - source.start),
      end:Math.min(source.end - source.start, range.end - source.start)
    })))
  }))
}

function sentenceWindow(text: string, start: number, end: number, sentenceCount: number) {
  let snippetStart = start
  for (let count = 0; count < 1; count++) {
    const boundary = text.slice(0, snippetStart).search(/[.!?](?:\s+)[^.!?]*$/s)
    snippetStart = boundary >= 0 ? boundary + 1 : Math.max(0, text.lastIndexOf('\n', snippetStart - 1) + 1)
  }
  let snippetEnd = end
  for (let count = 0; count < sentenceCount; count++) {
    const tail = text.slice(snippetEnd)
    const boundary = tail.search(/[.!?](?=\s|$)/)
    if (boundary < 0) { snippetEnd = Math.min(text.length, text.indexOf('\n', snippetEnd) >= 0 ? text.indexOf('\n', snippetEnd) : text.length); break }
    snippetEnd += boundary + 1
  }
  return { start:snippetStart, end:snippetEnd }
}

function evidenceContext(text: string, pages: ReturnType<typeof documentPageRanges>, start: number, end: number, sentenceCount: number) {
  const sentence = sentenceWindow(text, start, end, sentenceCount)
  const section = sectionRangeAt(text, start)
  const page = pages.find((candidate) => start >= candidate.start && start <= candidate.end)
  return {
    bounds:{
      start:Math.max(sentence.start, section?.contentStart ?? 0, page?.start ?? 0),
      end:Math.min(sentence.end, section?.end ?? text.length, page?.end ?? text.length)
    },
    section:section?.name ?? null,
    page:page?.page ?? null
  }
}

function sectionRangeAt(text: string, offset: number) {
  const headings: Array<{ name: string; start: number; contentStart: number }> = []
  for (const match of text.matchAll(/^([^\n]{1,100})$/gm)) {
    const name = evidenceHeading(match[1])
    if (!name || match.index === undefined) continue
    const lineEnd = match.index + match[0].length
    headings.push({ name, start:match.index, contentStart:lineEnd + (text[lineEnd] === '\n' ? 1 : 0) })
  }
  let index = -1
  for (let candidate = headings.length - 1; candidate >= 0; candidate--) {
    if (headings[candidate].start <= offset) {
      index = candidate
      break
    }
  }
  if (index < 0) return null
  return { ...headings[index], end:headings[index + 1]?.start ?? text.length }
}

function evidenceHeading(line: string) {
  const stripped = line.replace(/^\s*(?:(?:section\s+)?\d+(?:\.\d+)*|[IVXLC]+|[A-Z])\s*[.)\-:]\s*/i, '').trim().replace(/[:\-–—]\s*$/, '')
  const headings = [...COMMON_SECTION_HEADINGS,
    'Assignments', 'Homework Assignments', 'Movies and Movie Worksheets', 'In-class quizzes', 'Absences', 'Additional Information']
  return headings.find((heading) => normalizeHeading(stripped) === normalizeHeading(heading)) ?? null
}

function mergeHighlights(highlights: SyllabusHighlight[]) {
  const ordered = highlights.filter((range) => range.end > range.start).sort((a, b) => a.start - b.start)
  const merged: SyllabusHighlight[] = []
  for (const range of ordered) {
    const previous = merged.at(-1)
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end)
    else merged.push({ ...range })
  }
  return merged
}

function officeHoursType(value: string) {
  if (!value.trim()) return 'unknown'
  const appointment = /by appointment/i.test(value)
  const scheduled = /\b(?:Mon|Tue|Wed|Thu|Fri|Monday|Tuesday|Wednesday|Thursday|Friday)\b|\d{1,2}(?::|\.)\d{2}\s*(?:am|pm)/i.test(value)
  return appointment && scheduled ? 'scheduled_or_appointment' : appointment ? 'appointment_only' : scheduled ? 'scheduled' : 'provided'
}

function attendanceType(value: string) {
  const absent = /\bno attendance is taken\b/i.test(value)
  const required = /\b(?:attendance[^.!?]{0,50}(?:required|mandatory)|(?:required|mandatory) to attend)\b/i.test(value)
  if (absent && required) return 'mixed'
  if (absent) return 'not_taken'
  if (required) return 'required'
  if (/\bexpected to (?:attend|be present)\b/i.test(value)) return 'expected'
  if (/\bencouraged to (?:attend|be present)\b/i.test(value)) return 'encouraged'
  return value.trim() ? 'provided' : 'unknown'
}

function latePolicyType(value: string) {
  if (/\bgrace period\b/i.test(value) && /\b(?:per|each) day\b/i.test(value)) return 'grace_then_daily_penalty'
  if (/\b(?:will not|not be) accepted\b/i.test(value)) return 'no_late'
  if (/\bwithin \d+ hours?\b/i.test(value) && /\bpenalty\b/i.test(value)) return 'fixed_window_penalty'
  if (/\b(?:per|each) day late\b/i.test(value)) return 'daily_penalty'
  if (/\bpenalty\b|\bscored as zero\b/i.test(value)) return 'fixed_penalty'
  return value.trim() ? 'provided' : 'unknown'
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractCourseTitle(text: string) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 40)
  for (const line of lines) {
    const commaSeparated = line.match(/^[A-Z]{2,5}(?:\s*\([A-Z]{2,5}\))?\s+\d{3,5}\s*-\s*[A-Z0-9]{2,5}\s*,\s*\d+(?:\.\d+)?\s*,\s*(.+)$/i)
    const sectionSeparated = line.match(/^[A-Z]{2,5}(?:\s*\([A-Z]{2,5}\))?\s+\d{3,5}(?:\s+[A-Z0-9]{2,5})?\s*[-–—]\s*(.+)$/i)
    const title = (commaSeparated?.[1] ?? sectionSeparated?.[1])?.trim()
    if (!title || /^(?:merge|section|lec(?:ture)?)\b/i.test(title)) continue
    return title
      .replace(/^Elem\.?\s+/i, 'Elementary ')
      .replace(/\b(?:And|In|Of|The|To)\b/g, (word, offset: number) => offset === 0 ? word : word.toLowerCase())
  }
  return ''
}

function extractInstructor(text: string) {
  const contactSection = firstNonEmpty(
    sectionAny(text, ['Instructor(s) Contact Information', 'Instructor Contact Information', 'Instructor Information', 'Course Instructor'],
      ['Student Consultation Hours', 'Office Hours', 'Additional Information', 'Course Description', 'Course Information'])
  )
  const named = contactSection.match(/(?:^|\n)\s*(?:Name|Instructor(?:\s+name)?|Faculty)\s*:\s*([^\n]+)/i)?.[1]
    ?? text.match(/(?:^|\n)\s*(?:Course\s+)?Instructor(?:\s+name)?\s*:\s*([^\n]+)/i)?.[1]
  if (named) return cleanPersonName(named)

  const titled: string[] = []
  for (const match of text.matchAll(/\b(?:Prof\.|Professor|Dr\.)\s+([A-Z][A-Za-z'’.\-]+(?:\s+[A-Z][A-Za-z'’.\-]+){1,3})/g)) {
    const candidate = cleanPersonName(match[1])
    if (candidate && !titled.includes(candidate)) titled.push(candidate)
    if (titled.length === 3) break
  }
  return titled.join(' & ')
}

function cleanPersonName(value: string) {
  return value.replace(/\s+/g, ' ').replace(/\s+(?:Email|Office|Phone).*$/i, '').trim()
}

function normalizeText(value: string) {
  return value
    .replace(/\r/g, '')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/\u00ad/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function section(text: string, heading: string, nextHeadings: string[]) {
  return sectionAny(text, [heading], nextHeadings)
}

function sectionAny(text: string, headings: string[], nextHeadings: string[]) {
  const lines = text.split('\n').map((line) => line.trim())
  let inline = ''
  const start = lines.findIndex((line) => {
    const match = matchHeading(line, headings)
    if (match !== null) inline = match
    return match !== null
  })
  if (start < 0) return ''
  const stopNames = [...nextHeadings, ...COMMON_SECTION_HEADINGS]
  const body: string[] = inline ? [inline] : []
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index]
    if (matchHeading(line, stopNames) !== null) break
    if (/^Page \d+ of \d+$/i.test(line)) continue
    body.push(line)
  }
  return body.join('\n').trim().slice(0, 8000)
}

const COMMON_SECTION_HEADINGS = [
  'Course Information', 'Course Description', 'Course Overview', 'Catalog Description', 'About This Course',
  'Course Learning Outcomes', 'Learning Objectives', 'Prerequisites', 'Required Materials', 'Course Materials',
  'Instructor(s) Contact Information', 'Instructor Contact Information', 'Instructor Information', 'Course Instructor',
  'Student Consultation Hours', 'Office Hours', 'Instructor Office Hours', 'Student Hours', 'Availability',
  'Communication', 'Course Policies', 'Attendance Policy', 'Class Attendance', 'Attendance and Participation',
  'Participation and Attendance', 'Late Policy', 'Late Work', 'Late Work Policy', 'Grading', 'Grading Scale',
  'Grades and Grade Reports', 'Course Schedule', 'Academic Integrity', 'AI Policy', 'University Policies'
]

function matchHeading(line: string, headings: string[]) {
  const stripped = line.replace(/^\s*(?:(?:section\s+)?\d+(?:\.\d+)*|[IVXLC]+|[A-Z])\s*[.)\-:]\s*/i, '').trim()
  for (const heading of headings) {
    if (normalizeHeading(stripped) === normalizeHeading(heading)) return ''
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const inline = stripped.match(new RegExp(`^${escaped}\\s*[:\\-–—]\\s*(.+)$`, 'i'))
    if (inline) return inline[1].trim()
  }
  return null
}

function normalizeHeading(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function extractLatePolicy(text: string) {
  const explicit = sectionAny(text,
    ['Late Policy', 'Late Work', 'Late Work Policy', 'Late/Missed Work Policy', 'Late Submission Policy'],
    ['Grading Scale', 'Attendance Policy', 'Course Schedule', 'Academic Integrity', 'University Policies'])
  if (explicit) return explicit
  const sentence = text.match(/[^.\n]*\bLate\b[^.\n]*\.(?:\s+[^.\n]*(?:drop|penalt)[^.\n]*\.)?/i)
  if (sentence) return sentence[0].trim()
  const paragraphs = text.split(/\n\s*\n/)
  const match = paragraphs.find((paragraph) => /\blate\b/i.test(paragraph) && /(accept|submit|penalt|pre-approv|deadline)/i.test(paragraph))
  if (match) return match.replace(/^Assignments\s*/i, '').trim()
  return ''
}

function extractOfficeHoursFallback(text: string) {
  for (const line of text.split('\n').map((value) => value.trim()).filter(Boolean)) {
    if (!/\b(?:office|student|consultation)\s+hours?\b/i.test(line)) continue
    if (!/(?:\b(?:Mon|Tue|Wed|Thu|Fri|Monday|Tuesday|Wednesday|Thursday|Friday)\b|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|by appointment)/i.test(line)) continue
    return line.replace(/^.*?hours?\s*[:\-–—]?\s*/i, '').trim() || line
  }
  return ''
}

function extractPolicyParagraph(text: string, subject: RegExp, behavior: RegExp) {
  const sentences = text.split(/(?<=[.!?])\s+/).map((value) => value.trim()).filter(Boolean)
  const sentenceIndex = sentences.findIndex((value) => subject.test(value) && behavior.test(value))
  if (sentenceIndex >= 0) return sentences.slice(sentenceIndex, sentenceIndex + 2).join(' ').trim().slice(0, 5000)
  const lines = text.split('\n').map((value) => value.trim()).filter(Boolean)
  const index = lines.findIndex((value) => subject.test(value) && behavior.test(value))
  if (index < 0) return ''
  return lines.slice(index, index + 3).join('\n').trim().slice(0, 5000)
}

function extractGradingItems(text: string, courseId: number): ParsedSyllabus['gradingItems'] {
  const scope = firstNonEmpty(
    section(text, 'Grades and Grade Reports', ['Attendance Policy', 'Course Schedule']),
    section(text, 'Grading', ['Attendance Policy', 'Course Schedule']),
    text
  )
  const found: Array<{ label: string; weight: number }> = []
  const add = (label: string, weight: number) => {
    const cleaned = cleanGradeLabel(label)
    const normalized = normalizeHeading(cleaned)
    if (!cleaned || isGradeTotalLabel(normalized) || weight <= 0 || weight > 100
      || found.some((item) => normalizeHeading(item.label) === normalized)) return
    found.push({ label: cleaned, weight })
  }
  const addCategory = (label: string, weight: number, each = false) => {
    if (each) {
      const count = numberBeforeCategory(label) ?? (/midterms?/i.test(label) ? 2 : null)
      if (count && count <= 6) {
        const singular = /midterm/i.test(label) ? 'Midterm' : cleanGradeLabel(label).replace(/s$/i, '')
        for (let index = 1; index <= count; index++) add(`${singular} ${index}`, weight)
        return
      }
    }
    add(toLabel(label), weight)
  }
  const lines = scope.split('\n').map((value) => value.trim()).filter(Boolean)
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const followingPercentage = lines[index + 1]?.match(/^(\d{1,3}(?:\.\d+)?)\s*%(?:\s+(each))?$/i)
    if (followingPercentage) {
      addCategory(line, Number(followingPercentage[1]), Boolean(followingPercentage[2]))
      index++
      continue
    }

    const percentFirst = line.match(/^(\d{1,3}(?:\.\d+)?)\s*%\s*[-–—:]\s*(.+)$/i)
    if (percentFirst) {
      const label = percentFirst[2]
        .replace(/^\d+\s+/, '')
        .replace(/\s*\([^)]*(?:pts?|points?)[^)]*\).*$/i, '')
        .replace(/:\s*\d+\s*(?:possible\s+)?points?.*$/i, '')
      addCategory(label, Number(percentFirst[1]))
      continue
    }

    const categoryFirst = line.match(/^([A-Za-z][A-Za-z0-9 &/(),+#'\-]{1,70}?)\s*(?::|\t|\bis\s+(?:collectively\s+)?worth\b|\s{2,})\s*%?(\d{1,3}(?:\.\d+)?)\s*%(?:\s+(each))?/i)
      ?? line.match(/^([A-Za-z][A-Za-z0-9 &/(),+#'\-]{1,50}?)\s+%?(\d{1,3}(?:\.\d+)?)\s*%(?:\s+(each))?$/i)
    if (!categoryFirst) continue
    const label = categoryFirst[1]
    const weight = Number(categoryFirst[2])
    addCategory(label, weight, Boolean(categoryFirst[3]))
  }

  const homework = scope.match(/homework\s+(?:is\s+)?(?:worth\s+)?%?(\d{1,3})\s*%/i)
  if (homework) add('Homework', Number(homework[1]))
  const midterms = scope.match(/midterms?[^\n.]{0,30}?%?(\d{1,3})\s*%?\s*\+\s*%?(\d{1,3})\s*%/i)
  if (midterms) {
    add('Midterm 1', Number(midterms[1]))
    add('Midterm 2', Number(midterms[2]))
  }
  const finalExam = scope.match(/final(?:\s+exam)?\s+(?:is\s+)?(?:worth\s+)?(?:%(\d{1,3})|(\d{1,3})\s*%)/i)
  if (finalExam) add('Final exam', Number(finalExam[1] ?? finalExam[2]))

  const resolvedPercentages = removeAggregateRows(found)
  if (resolvedPercentages.length) {
    return resolvedPercentages.map((item, index) => ({
      id: `brightspace-syllabus-${courseId}-grade-${index + 1}`,
      ...item,
      points: null
    }))
  }

  const pointRows: Array<{ label: string; points: number }> = []
  for (const line of text.split('\n').map((value) => value.trim()).filter(Boolean)) {
    const match = line.match(/^(.{2,100}?)\s*:?\s*TOTAL\s*=\s*(\d+(?:\.\d+)?)\s*\*?\s*(?:PTS?|POINTS?)\b/i)
    if (!match) continue
    const label = cleanGradeLabel(match[1])
    const normalized = normalizeHeading(label)
    if (!label || /^(?:course)?grand(?:total)?$|^coursetotal$/.test(normalized)) continue
    if (!pointRows.some((item) => normalizeHeading(item.label) === normalized)) {
      pointRows.push({ label, points: Number(match[2]) })
    }
  }
  const hasExamAggregate = pointRows.some((item) => normalizeHeading(item.label) === 'exams')
  const topLevelRows = hasExamAggregate
    ? pointRows.filter((item) => normalizeHeading(item.label) === 'exams' || !/(midterm|finalexam)/i.test(normalizeHeading(item.label)))
    : pointRows
  return topLevelRows.map((item, index) => ({
    id: `brightspace-syllabus-${courseId}-grade-${index + 1}`,
    label:item.label,
    weight:0,
    points:item.points
  }))
}

function isGradeTotalLabel(normalizedLabel: string) {
  return /^(?:total|coursetotal|grandtotal|coursegrandtotal|overalltotal)$/.test(normalizedLabel)
}

function extractExamEvents(text: string, courseId: number, courseName: string, timezone: string) {
  const year = Number(courseName.match(/\b(20\d{2})\b/)?.[1] ?? new Date().getFullYear())
  const meeting = text.match(/Meeting Day\(s\) and Time\(s\):[^\n/]*\/\s*(\d{3,4})/i)?.[1]
  const digits = meeting?.padStart(4, '0')
  const hour = digits ? Number(digits.slice(0, 2)) : 23
  const minute = digits ? Number(digits.slice(2)) : 59
  const events: ParsedSyllabus['events'] = []
  const seen = new Set<string>()
  const addEvent = (rawTitle: string, month: number, day: number, rawTime?: string, explicitYear?: number) => {
    const title = cleanExamTitle(rawTitle)
    const key = normalizeHeading(title)
    if (!title || seen.has(key)) return
    const clock = parseClock(rawTime, hour, minute)
    const date = DateTime.fromObject({ year: explicitYear ?? year, month, day, hour: clock.hour, minute: clock.minute }, { zone: timezone })
    const dueAt = date.isValid ? date.toISO() : null
    if (!dueAt) return
    seen.add(key)
    events.push({ id: `brightspace:syllabus:${courseId}:exam:${key}`, title, type: 'exam', dueAt })
  }
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (/\b(?:review|makeup|make-up|cancelled|study guide)\b/i.test(line)) continue
    const combined = /^(?:Midterm|Exam|Final)(?:\s+Exam)?\s*#?\s*\d*\s*$/i.test(line) && lines[index + 1]
      ? `${line} ${lines[index + 1]}` : line
    const numeric = combined.match(/\b((?:Midterm|Exam)\s*#?\s*\d+|Final(?:\s+Exam)?)\b[^\n]{0,55}?\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/i)
    if (numeric) {
      const time = combined.slice((numeric.index ?? 0) + numeric[0].length).match(/\b(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|midnight|noon)\b/i)?.[1]
      addEvent(numeric[1], Number(numeric[2]), Number(numeric[3]), time, normalizeYear(numeric[4]))
      continue
    }
    const dateFirst = combined.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b[^\n]{0,90}?\b((?:Midterm|Exam)\s*#?\s*\d+|Final(?:\s+Exam)?)\b/i)
    if (dateFirst) {
      const time = combined.match(/\b(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|midnight|noon)\b/i)?.[1]
      addEvent(dateFirst[4], Number(dateFirst[1]), Number(dateFirst[2]), time, normalizeYear(dateFirst[3]))
      continue
    }
    const named = combined.match(/\b((?:Midterm|Exam)\s*#?\s*\d+|Final(?:\s+Exam)?)\b[^\n]{0,65}?(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*)?([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?/i)
    if (!named) continue
    const parsed = DateTime.fromFormat(`${named[2]} ${named[3]} ${year}`, 'MMM d yyyy', { zone: timezone, locale: 'en' })
    const fallback = DateTime.fromFormat(`${named[2]} ${named[3]} ${year}`, 'MMMM d yyyy', { zone: timezone, locale: 'en' })
    const date = parsed.isValid ? parsed : fallback
    if (!date.isValid) continue
    const time = combined.slice((named.index ?? 0) + named[0].length).match(/\b(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|midnight|noon)\b/i)?.[1]
    addEvent(named[1], date.month, date.day, time)
  }
  return events
}

function cleanGradeLabel(value: string) {
  return toLabel(value)
    .replace(/^\d+\s+/, '')
    .replace(/\s*\([^)]*(?:pts?|points?)?[^)]*\)\s*$/i, '')
    .replace(/^The\s+/i, '')
    .replace(/\s+(?:Are|Is)\s+Worth$/i, '')
    .trim()
}

function numberBeforeCategory(value: string) {
  const digit = value.match(/^\s*(\d+)\b/)?.[1]
  if (digit) return Number(digit)
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }
  return words[value.trim().split(/\s+/)[0]?.toLowerCase()]
}

function removeAggregateRows(items: Array<{ label: string; weight: number }>) {
  return items.filter((item) => {
    const label = normalizeHeading(item.label)
    if (/hlq|homeworkslabsandquizzes/.test(label)) {
      const parts = items.filter((other) => other !== item && /(homework|lab|quiz)/i.test(other.label))
      return Math.abs(parts.reduce((sum, other) => sum + other.weight, 0) - item.weight) > 0.01
    }
    if (label === 'exams') {
      const parts = items.filter((other) => other !== item && /(midterm|final)/i.test(other.label))
      return Math.abs(parts.reduce((sum, other) => sum + other.weight, 0) - item.weight) > 0.01
    }
    return true
  })
}

function cleanExamTitle(value: string) {
  const compact = value.replace(/\s+/g, ' ').trim()
  const numbered = compact.match(/\b(Midterm|Exam)\s*#?\s*(\d+)\b/i)
  if (numbered) return `${toLabel(numbered[1])} ${numbered[2]}`
  if (/\bfinal\b/i.test(compact)) return 'Final exam'
  return ''
}

function normalizeYear(value?: string) {
  if (!value) return undefined
  const numeric = Number(value)
  return numeric < 100 ? 2000 + numeric : numeric
}

function parseClock(value: string | undefined, fallbackHour: number, fallbackMinute: number) {
  if (!value) return { hour: fallbackHour, minute: fallbackMinute }
  if (/midnight/i.test(value)) return { hour: 23, minute: 59 }
  if (/noon/i.test(value)) return { hour: 12, minute: 0 }
  const match = value.replace(/\./g, '').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
  if (!match) return { hour: fallbackHour, minute: fallbackMinute }
  let parsedHour = Number(match[1]) % 12
  if (match[3].toLowerCase() === 'pm') parsedHour += 12
  return { hour: parsedHour, minute: Number(match[2] ?? 0) }
}

function firstNonEmpty(...values: string[]) {
  return values.find((value) => value.trim())?.trim() ?? ''
}

function toLabel(value: string) {
  return value.trim().replace(/\s+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
