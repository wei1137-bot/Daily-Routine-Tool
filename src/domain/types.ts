export type EventStatus = 'not_done' | 'in_progress' | 'done'
export type EventType = 'assignment' | 'quiz' | 'exam' | 'lab' | 'project' | 'discussion' | 'reading' | 'lecture' | 'office_hour' | 'other'

export interface Course {
  id: string; code: string; name: string; instructor: string; term: string
  colorKey: string; timezone: string; notes: string; createdAt?: string; updatedAt?: string
}

export interface AcademicEvent {
  id: string; courseId: string; title: string; type: EventType; dueAt: string
  dueTimezone: string; releaseAt?: string | null; status: EventStatus; sourceType: string
  sourceLabel?: string | null; sourceExternalId?: string | null; rawSourceText?: string | null
  confidence?: number | null; userEdited?: boolean; createdAt?: string; updatedAt?: string
  sourceDueTimes?: Array<{ dueAt: string; sourceLabel: string }>
}

export interface SyllabusInfo {
  courseId: string; filePath?: string | null; fileName?: string | null
  attendancePolicy: string; latePolicy: string; officeHours: string; rawSummary: string
  sourceType?: string | null; sourceExternalId?: string | null; rawText?: string | null
  userEdited?: boolean; fieldResults?: Record<SyllabusFieldKey, SyllabusFieldResult>
}

export type SyllabusFieldKey = 'rawSummary' | 'officeHours' | 'attendancePolicy' | 'latePolicy'
export interface SyllabusHighlight { start: number; end: number }
export interface SyllabusEvidenceSource {
  section: string; page: number | null; text: string; highlights: SyllabusHighlight[]; correctedText?: string
}
export interface SyllabusFieldResult { display: string; type: string; sources: SyllabusEvidenceSource[] }

export type CurrentScoreMode = 'earned' | 'lost'

export interface GradingItem {
  id: string; courseId: string; label: string; weight: number
  points?: number | null; targetPoints?: number | null; currentPoints?: number | null
  currentMode?: CurrentScoreMode; userEdited?: boolean
}

export interface CourseMeeting {
  id: string; courseId: string; dayOfWeek: number; startTime: string; endTime: string
  location: string; instructor: string; label: string; sourceType: string; sourceImageName?: string | null
}

export interface DetectedMeeting extends Omit<CourseMeeting, 'id' | 'courseId' | 'sourceType'> {
  courseCode: string; confidence: number
}

export interface ScheduleRecognition {
  meetings: DetectedMeeting[]; rawText: string; confidence: number; imageName: string
}

export interface DetectedEvent {
  id: string; courseId?: string | null; courseCode?: string | null; title: string; type: EventType
  dueAt: string; dueTimezone: string; sourceType: string; sourceLabel?: string | null
  sourceExternalId?: string | null; rawSourceText?: string | null; confidence?: number | null; state?: string; createdAt?: string
}

export interface EventPlan {
  eventId: string
  plannedDate: string
}

export interface AppState {
  courses: Course[]; events: AcademicEvent[]; syllabi: SyllabusInfo[]
  gradingItems: GradingItem[]; meetings: CourseMeeting[]; detectedEvents: DetectedEvent[]
  eventPlans: EventPlan[]; settings: Record<string, string>
}

export type Page = 'dashboard' | 'schedule' | 'calendar' | 'settings' | 'course'

export interface BrightspaceStatus {
  connected: boolean; baseUrl: string; message: string
}

export interface BrightspaceSyncSummary {
  coursesFound: number; coursesAdded: number; coursesRemoved: number; itemsFound: number; itemsAdded: number
  itemsUpdated: number; duplicatesSkipped: number; itemsWithoutDueDate: number; warnings: string[]; syncedAt: string
  enrolledCourses: number; currentCourses: number; skippedByAccessWindow: number; inaccessibleCourses: number
  skippedNonAcademic: number
  syllabiFound: number; syllabiImported: number; syllabusEventsAdded: number
}

export interface BrightspaceSyncResult { state: AppState; summary: BrightspaceSyncSummary }

export interface GradescopeStatus { connected: boolean; message: string }
export interface GradescopeAutoLoginStatus { enabled: boolean; encryptionAvailable: boolean; emailHint: string }
export interface GradescopeSyncSummary {
  coursesFound: number; currentCourses: number; skippedTerms: number; coursesAdded: number
  itemsFound: number; itemsAdded: number; itemsUpdated: number; duplicatesSkipped: number
  itemsWithoutDueDate: number; warnings: string[]; syncedAt: string
}
export interface GradescopeSyncResult { state: AppState; summary: GradescopeSyncSummary }
