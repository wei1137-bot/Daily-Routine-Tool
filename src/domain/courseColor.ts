import type { CSSProperties } from 'react'

const customColorPattern = /^#[0-9a-f]{6}$/i

export function isCustomCourseColor(value?: string | null) {
  return customColorPattern.test(value ?? '')
}

export function courseColorClass(value?: string | null) {
  return isCustomCourseColor(value) ? '' : (value || 'blue')
}

export function courseColorStyle(value?: string | null): CSSProperties | undefined {
  return isCustomCourseColor(value) ? { backgroundColor: value! } : undefined
}

export function calendarCourseColorStyle(value?: string | null): CSSProperties | undefined {
  if (!isCustomCourseColor(value)) return undefined
  return { backgroundColor: `${value}18`, borderColor: value!, color: value! }
}
