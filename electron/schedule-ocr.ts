import { nativeImage } from 'electron'
import Tesseract from 'tesseract.js'

export interface RecognizedScheduleMeeting {
  courseCode: string
  dayOfWeek: number
  startTime: string
  endTime: string
  location: string
  instructor: string
  label: string
  sourceImageName: string
  confidence: number
}

interface PositionedText {
  text: string
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']

export async function recognizeScheduleImage(
  imageBytes: Buffer,
  imageName: string,
  knownCourseCodes: string[],
  langPath: string
) {
  const image = nativeImage.createFromBuffer(imageBytes)
  if (image.isEmpty()) throw new Error('The selected file is not a readable image.')
  const { width, height } = image.getSize()
  const worker = await Tesseract.createWorker('eng', 1, { langPath })
  try {
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT, preserve_interword_spaces: '1' })
    const result = await worker.recognize(imageBytes, {}, { text: true, blocks: true })
    const blocks: PositionedText[] = (result.data.blocks ?? []).map((block) => ({
      text: block.text.replace(/\s+/g, ' ').trim(), confidence: block.confidence, bbox: block.bbox
    })).filter((block) => Boolean(block.text))
    const dayCenters = findDayCenters(blocks, width)
    const timeScale = findTimeScale(blocks, height)
    const candidates = blocks.flatMap((block) => {
      const course = matchCourse(block.text, knownCourseCodes)
      if (!course) return []
      const dayOfWeek = nearestDay((block.bbox.x0 + block.bbox.x1) / 2, dayCenters)
      const minutes = roundToTen(timeScale.toMinutes(block.bbox.y0 - 4))
      const label = /\blab\b/i.test(block.text) ? 'Lab' : /\b(rec|recitation)\b/i.test(block.text) ? 'Recitation' : 'Lecture'
      const duration = label === 'Lab' ? 110 : 50
      return [{ block, courseCode: course, dayOfWeek, startMinutes: minutes, endMinutes: minutes + duration, label }]
    })
    const unique = [...new Map(candidates.map((item) => [
      `${item.courseCode}:${item.dayOfWeek}:${item.startMinutes}:${item.label}`, item
    ])).values()]
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' })
    const meetings: RecognizedScheduleMeeting[] = []
    for (const item of unique) {
      const bounds = dayBounds(item.dayOfWeek, dayCenters, width)
      const top = Math.max(0, Math.round(timeScale.toY(item.startMinutes) - 5))
      const bottom = Math.min(height, Math.round(timeScale.toY(item.endMinutes) + 5))
      const crop = image.crop({ x: bounds.left, y: top, width: bounds.right - bounds.left, height: Math.max(20, bottom - top) })
        .resize({ width: Math.max(320, (bounds.right - bounds.left) * 2) })
      let detail = item.block.text
      try {
        const detailResult = await worker.recognize(crop.toPNG(), {}, { text: true })
        if (detailResult.data.text.trim()) detail = detailResult.data.text.trim()
      } catch { /* The title-level recognition is still usable. */ }
      const location = extractLocation(detail)
      meetings.push({
        courseCode: item.courseCode,
        dayOfWeek: item.dayOfWeek,
        startTime: formatMinutes(item.startMinutes),
        endTime: formatMinutes(item.endMinutes),
        location,
        instructor: extractInstructor(detail, location),
        label: item.label,
        sourceImageName: imageName,
        confidence: Math.max(0, Math.min(1, item.block.confidence / 100))
      })
    }
    for (const meeting of meetings) {
      const peers = meetings.filter((candidate) => candidate.courseCode === meeting.courseCode && candidate.label === meeting.label)
      if (!meeting.location) meeting.location = mostCommon(peers.map((candidate) => candidate.location).filter(Boolean))
      if (!meeting.instructor) meeting.instructor = mostCommon(peers.map((candidate) => candidate.instructor).filter(Boolean))
    }
    return { meetings, rawText: result.data.text, confidence: Math.max(0, Math.min(1, result.data.confidence / 100)), imageName }
  } finally {
    await worker.terminate()
  }
}

function findDayCenters(blocks: PositionedText[], width: number) {
  const detected = dayNames.map((name, index) => {
    const block = blocks.find((item) => item.text.toLowerCase().includes(name))
    return block ? { day: index + 1, x: (block.bbox.x0 + block.bbox.x1) / 2 } : null
  }).filter((item): item is { day: number; x: number } => Boolean(item))
  if (detected.length >= 3) return dayNames.map((_, index) => {
    const exact = detected.find((item) => item.day === index + 1)
    return exact?.x ?? width * ((index + .5) / 5)
  })
  return dayNames.map((_, index) => width * ((index + .5) / 5))
}

function findTimeScale(blocks: PositionedText[], height: number) {
  const points = blocks.flatMap((block) => {
    const minutes = parseClockLabel(block.text)
    return minutes === null || block.bbox.x0 > 70 ? [] : [{ y: block.bbox.y0, minutes }]
  })
  if (points.length < 2) {
    const pixelsPerMinute = height / (12 * 60)
    return { toMinutes: (y: number) => 7 * 60 + (y - height * .04) / pixelsPerMinute, toY: (minutes: number) => height * .04 + (minutes - 7 * 60) * pixelsPerMinute }
  }
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length
  const meanMinutes = points.reduce((sum, point) => sum + point.minutes, 0) / points.length
  const slope = points.reduce((sum, point) => sum + (point.y - meanY) * (point.minutes - meanMinutes), 0)
    / points.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0)
  const intercept = meanMinutes - slope * meanY
  return { toMinutes: (y: number) => intercept + slope * y, toY: (minutes: number) => (minutes - intercept) / slope }
}

function parseClockLabel(value: string) {
  const normalized = value.toLowerCase().replace(/\s/g, '').replace(/^s(?=pm$)/, '5')
  const match = normalized.match(/^(1[0-2]|[1-9])(am|pm)$/)
  if (!match) return null
  let hour = Number(match[1]) % 12
  if (match[2] === 'pm') hour += 12
  return hour * 60
}

function matchCourse(value: string, knownCourseCodes: string[]) {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  for (const code of knownCourseCodes) {
    const match = code.toUpperCase().match(/^([A-Z]{2,5})\s*(\d{3,5})$/)
    if (!match) continue
    const [, subject, digits] = match
    if (normalized.includes(`${subject}${digits}`) || normalized.includes(`${subject}${digits}00`)) return `${subject} ${digits}`
  }
  for (const code of knownCourseCodes) {
    const match = code.toUpperCase().match(/^([A-Z]{2,5})\s*(\d{3,5})$/)
    if (!match) continue
    const [, subject, digits] = match
    if (normalized.includes(`${digits}00`) || new RegExp(`(?:^|[^0-9])${digits}(?:[^0-9]|$)`).test(value)) return `${subject} ${digits}`
  }
  const fallback = value.toUpperCase().match(/\b([A-Z]{2,5})\s*(\d{3})(?:00)?\b/)
  return fallback ? `${fallback[1]} ${fallback[2]}` : null
}

function nearestDay(x: number, centers: number[]) {
  let best = 0
  for (let index = 1; index < centers.length; index++) if (Math.abs(centers[index] - x) < Math.abs(centers[best] - x)) best = index
  return best + 1
}

function dayBounds(day: number, centers: number[], width: number) {
  const index = day - 1
  const left = index === 0 ? Math.max(0, Math.round(centers[0] - (centers[1] - centers[0]) / 2)) : Math.round((centers[index - 1] + centers[index]) / 2)
  const right = index === centers.length - 1 ? Math.min(width, Math.round(centers[index] + (centers[index] - centers[index - 1]) / 2)) : Math.round((centers[index] + centers[index + 1]) / 2)
  return { left, right }
}

function extractLocation(value: string) {
  const raw = value.toUpperCase().match(/\b([A-Z]{2,6})\s+([A-Z]?\d{2,4})\b/)?.[0] ?? ''
  return raw.replace(/^I?LWSN\b/, 'LWSN').replace(/^(?:HYS|PYS|YS)\b/, 'PHYS').replace(/^MP\b/, 'HAMP')
}

function extractInstructor(value: string, location: string) {
  if (!location) return ''
  const room = location.split(/\s+/).at(-1) ?? ''
  const line = value.split(/\r?\n/).find((item) => item.toUpperCase().includes(location) || item.toUpperCase().includes(room)) ?? ''
  const actualLocation = line.match(/\b[A-Z]{2,6}\s+[A-Z]?\d{2,4}\b/i)?.[0] ?? location
  const afterLocation = line.slice(line.toUpperCase().indexOf(actualLocation.toUpperCase()) + actualLocation.length).replace(/^[\s,;|]+/, '')
  return afterLocation.replace(/\b\d{2}\/\d{2}\s*[-–]\s*\d{2}\/\d{2}\b.*$/i, '')
    .replace(/[^\p{L}\s.'-]/gu, '').replace(/^[\s.'-]+|[\s.'-]+$/g, '').replace(/^([A-Z])([A-Z][a-z])/,'$1 $2').trim()
}

function mostCommon(values: string[]) {
  return values.sort((a, b) => values.filter((item) => item === b).length - values.filter((item) => item === a).length)[0] ?? ''
}

function roundToTen(value: number) {
  return Math.max(0, Math.min(23 * 60 + 50, Math.round(value / 10) * 10))
}

function formatMinutes(value: number) {
  const bounded = Math.max(0, Math.min(23 * 60 + 59, value))
  return `${String(Math.floor(bounded / 60)).padStart(2, '0')}:${String(bounded % 60).padStart(2, '0')}`
}
