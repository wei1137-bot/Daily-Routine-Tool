import type { AcademicEvent, AppState, BrightspaceStatus, BrightspaceSyncResult, Course, CourseMeeting, DetectedEvent, GradescopeAutoLoginStatus, GradescopeStatus, GradescopeSyncResult, GradingItem, ScheduleRecognition, SyllabusInfo } from './domain/types'

declare global {
  interface Window {
    dailyRoutine: {
      getState(): Promise<AppState>
      saveCourse(course: Course): Promise<AppState>
      deleteCourse(id: string): Promise<AppState>
      saveEvent(event: AcademicEvent): Promise<AppState>
      saveEventStatus(payload: Pick<AcademicEvent, 'id' | 'status'>): Promise<AppState>
      deleteEvent(id: string): Promise<AppState>
      saveSyllabus(syllabus: SyllabusInfo): Promise<AppState>
      saveGradingItems(payload: { courseId: string; items: GradingItem[]; displayMode: 'percentage' | 'points' }): Promise<AppState>
      saveSchedule(payload: { meetings: CourseMeeting[]; deletedIds: string[] }): Promise<AppState>
      saveEventPlans(payload: { plans: Array<{ eventId: string; plannedDate: string | null }> }): Promise<AppState>
      recognizeScheduleImage(payload: { bytes: Uint8Array; name: string }): Promise<ScheduleRecognition>
      saveDetected(item: DetectedEvent): Promise<AppState>
      resolveDetected(payload: { id: string; action: 'confirm' | 'ignored'; event?: AcademicEvent }): Promise<AppState>
      saveSetting(payload: { key: string; value: string | boolean }): Promise<AppState>
      resetDemo(): Promise<AppState>
      chooseSyllabus(): Promise<{ filePath: string; fileName: string } | null>
      openPath(path: string): Promise<string>
      getDataPath(): Promise<string>
      getBrightspaceStatus(baseUrl: string): Promise<BrightspaceStatus>
      connectBrightspace(baseUrl: string): Promise<BrightspaceStatus>
      disconnectBrightspace(baseUrl: string): Promise<BrightspaceStatus>
      getBrightspaceLogPath(): Promise<string>
      syncBrightspace(baseUrl: string): Promise<BrightspaceSyncResult>
      onBrightspaceSync(onComplete: (result: BrightspaceSyncResult) => void, onError: (message: string) => void): () => void
      getGradescopeStatus(): Promise<GradescopeStatus>
      connectGradescope(): Promise<GradescopeStatus>
      disconnectGradescope(): Promise<GradescopeStatus>
      getGradescopeLogPath(): Promise<string>
      syncGradescope(): Promise<GradescopeSyncResult>
      getGradescopeAutoLoginStatus(): Promise<GradescopeAutoLoginStatus>
      configureGradescopeAutoLogin(credentials: { email: string; password: string }): Promise<GradescopeAutoLoginStatus>
      disableGradescopeAutoLogin(): Promise<GradescopeAutoLoginStatus>
      onGradescopeSync(onComplete: (result: GradescopeSyncResult) => void, onError: (message: string) => void): () => void
    }
  }
}

export {}
