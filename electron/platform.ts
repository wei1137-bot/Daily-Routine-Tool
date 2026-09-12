export function hidesMainWindowOnClose(platform = process.platform) {
  return platform !== 'darwin'
}

export function usesMacApplicationMenu(platform = process.platform) {
  return platform === 'darwin'
}

export const MINIMUM_WINDOW_SIZE = { width: 980, height: 650 } as const

export function platformDefaultWindowSize(platform = process.platform) {
  return platform === 'darwin'
    ? { width: 1280, height: 720 }
    : { width: 1440, height: 900 }
}

export function resolveWindowSize(
  settings: Record<string, string>,
  platform = process.platform,
  workArea?: { width: number; height: number }
) {
  const fallback = platformDefaultWindowSize(platform)
  const requestedWidth = validDimension(settings.defaultWindowWidth) ?? fallback.width
  const requestedHeight = validDimension(settings.defaultWindowHeight) ?? fallback.height
  const maximumWidth = Math.max(MINIMUM_WINDOW_SIZE.width, workArea?.width ?? requestedWidth)
  const maximumHeight = Math.max(MINIMUM_WINDOW_SIZE.height, workArea?.height ?? requestedHeight)
  return {
    width: Math.min(Math.max(requestedWidth, MINIMUM_WINDOW_SIZE.width), maximumWidth),
    height: Math.min(Math.max(requestedHeight, MINIMUM_WINDOW_SIZE.height), maximumHeight)
  }
}

export function appZoomPercent(value?: string | number) {
  if (value === undefined || value === '') return 100
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 100
  return Math.min(130, Math.max(80, Math.round(parsed)))
}

function validDimension(value?: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
}
