import type { GradingItem } from './types'

export type GradingMode = 'percentage' | 'points'

export interface GradeContribution {
  earned: number | null
  contribution: number | null
}

export function gradingModeFor(items: GradingItem[], fallback: GradingMode = 'percentage'): GradingMode {
  if (items.some((item) => Number(item.points) > 0)) return 'points'
  if (items.some((item) => Number(item.weight) > 0)) return 'percentage'
  return fallback
}

export function toLossOnlyGradingItems(items: GradingItem[], mode: GradingMode): GradingItem[] {
  return items.map((item) => {
    if (item.currentMode !== 'earned' || item.currentPoints === null || item.currentPoints === undefined) {
      return { ...item, currentMode:'lost' }
    }
    const earned = Number(item.currentPoints)
    if (!Number.isFinite(earned)) return { ...item, currentPoints:null, currentMode:'lost' }
    const maximum = mode === 'points' ? Math.max(0, Number(item.points ?? 0)) : 100
    return { ...item, currentPoints:Math.max(0, maximum - earned), currentMode:'lost' }
  })
}

export function gradeContribution(item: GradingItem, mode: GradingMode): GradeContribution {
  const enteredValue = item.currentPoints === null || item.currentPoints === undefined ? 0 : Number(item.currentPoints)
  if (!Number.isFinite(enteredValue)) return { earned:null, contribution:null }
  const entered = Math.max(0, enteredValue)
  const maximum = mode === 'points' ? Math.max(0, Number(item.points ?? 0)) : 100
  const earned = Math.max(0, maximum - entered)
  return {
    earned,
    contribution:mode === 'points' ? earned : Number(item.weight || 0) * earned / 100
  }
}

export function projectedGrade(items: GradingItem[], mode: GradingMode) {
  const contributions = items.map((item) => gradeContribution(item, mode))
  const planned = contributions.filter((item) => item.contribution !== null)
  return {
    complete:items.length > 0 && planned.length === items.length,
    hasScores:planned.length > 0,
    value:planned.reduce((sum, item) => sum + Number(item.contribution), 0)
  }
}

export function gradeAThresholdPercent(text?: string | null): number | null {
  if (!text) return null
  const patterns = [
    /(?:^|\n)\s*A\s*(?:[:=]\s*)?(?:≥|>=|at\s+least)?\s*(\d{2,3}(?:\.\d+)?)\s*%/im,
    /(?:^|\n)\s*A\s*(?:\r?\n\s*)+(\d{2,3}(?:\.\d+)?)\s*[-–—]\s*\d{2,3}(?:\.\d+)?\s*%/im,
    /(\d{2,3}(?:\.\d+)?)\s*%\s+(?:of\s+the\s+total\s+points\s+)?(?:in\s+this\s+course\s+)?(?:are\s+)?guarantees?\s+an?\s+A(?![+-])/i,
    /(\d{2,3}(?:\.\d+)?)\s*%?\s+and\s+above\s+is\s+the\s+A\s+range/i
  ]
  for (const pattern of patterns) {
    const value = Number(text.match(pattern)?.[1])
    if (Number.isFinite(value) && value > 0 && value <= 100) return value
  }
  return null
}
