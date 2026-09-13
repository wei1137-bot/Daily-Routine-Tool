import type { CSSProperties } from 'react'

const customColorPattern = /^#[0-9a-f]{6}$/i
const courseColors: Record<string, string> = {
  blue:'#4e6ed4', violet:'#7859bd', amber:'#d3912f', rose:'#c85b73', teal:'#2d8d8a', green:'#4e8b62'
}

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

export function courseColorVariableStyle(value?: string | null): CSSProperties {
  const color = isCustomCourseColor(value) ? value! : courseColors[value || 'blue'] ?? courseColors.blue
  return { ['--course-color' as string]:color }
}
