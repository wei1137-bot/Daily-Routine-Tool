import { DateTime } from 'luxon'
import type { DetectedEvent, EventType } from '../../domain/types'

export interface SourceParser<TInput> {
  canParse(input: TInput): boolean
  parse(input: TInput): DetectedEvent[]
}

const inferType = (title: string): EventType => {
  const value = title.toLowerCase()
  if (value.includes('quiz')) return 'quiz'
  if (value.includes('exam') || value.includes('midterm') || value.includes('final')) return 'exam'
  if (value.includes('lab')) return 'lab'
  if (value.includes('discussion')) return 'discussion'
  if (value.includes('project')) return 'project'
  if (value.includes('reading')) return 'reading'
  return 'assignment'
}

export class BrightspaceEmailParser implements SourceParser<string> {
  canParse(input: string) {
    return /Due date:/i.test(input) && /(Activity summary|Brightspace|Due date is)/i.test(input)
  }

  parse(input: string): DetectedEvent[] {
    if (!this.canParse(input)) return []
    const course = input.match(/\b([A-Z]{2,5})\s*[- ]?\s*(\d{3})\b/)
    const title = input.match(/^\s*([^\r\n]+?)\s*-\s*Due date is[^\r\n]*$/im)
      ?? input.match(/(?:^|\n)\s*([^\r\n]+)\s*\n\s*Due date:/i)
    const due = input.match(/Due date:\s*\r?\n?\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*([^\r\n]+)/i)
      ?? input.match(/Due date:\s*\r?\n?\s*([^\r\n]+)/i)
    if (!course || !title || !due) return []
    const rawDate = due[1].trim()
    const timezoneCode = rawDate.match(/\b(EDT|EST|CDT|CST|MDT|MST|PDT|PST)\b/i)?.[1]?.toUpperCase()
    const zoneMap: Record<string, string> = {
      EDT: 'America/Indiana/Indianapolis', EST: 'America/Indiana/Indianapolis',
      CDT: 'America/Chicago', CST: 'America/Chicago', MDT: 'America/Denver', MST: 'America/Denver',
      PDT: 'America/Los_Angeles', PST: 'America/Los_Angeles'
    }
    const zone = zoneMap[timezoneCode ?? ''] ?? 'America/Indiana/Indianapolis'
    const withoutZone = rawDate.replace(/\s+(EDT|EST|CDT|CST|MDT|MST|PDT|PST)\b/i, '').trim()
    const parsed = DateTime.fromFormat(withoutZone, 'MMMM d, yyyy h:mm a', { zone, locale: 'en-US' })
    if (!parsed.isValid) return []
    const courseCode = `${course[1]} ${course[2]}`
    const cleanTitle = title[1].trim()
    return [{
      id: crypto.randomUUID(), courseCode, title: cleanTitle, type: inferType(cleanTitle),
      dueAt: parsed.toISO()!, dueTimezone: zone, sourceType: 'brightspace_email',
      sourceLabel: 'Brightspace Email', rawSourceText: input, confidence: 0.96
    }]
  }
}
