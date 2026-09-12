import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('dailyRoutine', {
  getState: () => ipcRenderer.invoke('db:get-state'),
  saveCourse: (course: unknown) => ipcRenderer.invoke('db:save-course', course),
  deleteCourse: (id: string) => ipcRenderer.invoke('db:delete-course', id),
  saveEvent: (event: unknown) => ipcRenderer.invoke('db:save-event', event),
  saveEventStatus: (payload: unknown) => ipcRenderer.invoke('db:save-event-status', payload),
  deleteEvent: (id: string) => ipcRenderer.invoke('db:delete-event', id),
  saveSyllabus: (syllabus: unknown) => ipcRenderer.invoke('db:save-syllabus', syllabus),
  saveGradingItems: (payload: unknown) => ipcRenderer.invoke('db:save-grading-items', payload),
  saveSchedule: (payload: unknown) => ipcRenderer.invoke('db:save-schedule', payload),
  saveEventPlans: (payload: unknown) => ipcRenderer.invoke('db:save-event-plans', payload),
  recognizeScheduleImage: (payload: unknown) => ipcRenderer.invoke('schedule:recognize-image', payload),
  saveDetected: (item: unknown) => ipcRenderer.invoke('db:save-detected', item),
  resolveDetected: (payload: unknown) => ipcRenderer.invoke('db:resolve-detected', payload),
  saveSetting: (payload: unknown) => ipcRenderer.invoke('db:save-setting', payload),
  resetDemo: () => ipcRenderer.invoke('db:reset-demo'),
  chooseSyllabus: () => ipcRenderer.invoke('file:choose-syllabus'),
  openPath: (path: string) => ipcRenderer.invoke('file:open-path', path),
  getDataPath: () => ipcRenderer.invoke('db:get-path'),
  getBrightspaceStatus: (baseUrl: string) => ipcRenderer.invoke('brightspace:status', baseUrl),
  connectBrightspace: (baseUrl: string) => ipcRenderer.invoke('brightspace:connect', baseUrl),
  disconnectBrightspace: (baseUrl: string) => ipcRenderer.invoke('brightspace:disconnect', baseUrl),
  getBrightspaceLogPath: () => ipcRenderer.invoke('brightspace:get-log-path'),
  syncBrightspace: (baseUrl: string) => ipcRenderer.invoke('brightspace:sync', baseUrl),
  getGradescopeStatus: () => ipcRenderer.invoke('gradescope:status'),
  connectGradescope: () => ipcRenderer.invoke('gradescope:connect'),
  disconnectGradescope: () => ipcRenderer.invoke('gradescope:disconnect'),
  getGradescopeLogPath: () => ipcRenderer.invoke('gradescope:get-log-path'),
  syncGradescope: () => ipcRenderer.invoke('gradescope:sync'),
  getGradescopeAutoLoginStatus: () => ipcRenderer.invoke('gradescope:auto-login-status'),
  configureGradescopeAutoLogin: (credentials: unknown) => ipcRenderer.invoke('gradescope:configure-auto-login', credentials),
  disableGradescopeAutoLogin: () => ipcRenderer.invoke('gradescope:disable-auto-login'),
  onBrightspaceSync: (onComplete: (result: unknown) => void, onError: (message: string) => void) => {
    const complete = (_event: Electron.IpcRendererEvent, result: unknown) => onComplete(result)
    const error = (_event: Electron.IpcRendererEvent, message: string) => onError(message)
    ipcRenderer.on('brightspace:sync-complete', complete)
    ipcRenderer.on('brightspace:sync-error', error)
    return () => {
      ipcRenderer.removeListener('brightspace:sync-complete', complete)
      ipcRenderer.removeListener('brightspace:sync-error', error)
    }
  },
  onGradescopeSync: (onComplete: (result: unknown) => void, onError: (message: string) => void) => {
    const complete = (_event: Electron.IpcRendererEvent, result: unknown) => onComplete(result)
    const error = (_event: Electron.IpcRendererEvent, message: string) => onError(message)
    ipcRenderer.on('gradescope:sync-complete', complete)
    ipcRenderer.on('gradescope:sync-error', error)
    return () => {
      ipcRenderer.removeListener('gradescope:sync-complete', complete)
      ipcRenderer.removeListener('gradescope:sync-error', error)
    }
  }
})
