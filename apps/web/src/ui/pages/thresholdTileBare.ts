import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { gradeParts, notGradedText } from '../grades'
import type { GradeOutcome } from '../grades'
import { threshold } from '../records'

/**
 * The grade line under the figure: the level and grade of the threshold above it. Where the levels row already says the level
 * and grade, the tile has no line, so a level is said once on the screen. A sport with no threshold has no line: its place says
 * what it needs, and the grade's gap is the same words.
 */
export function gradeLine(
  sport: Sport,
  grade: GradeOutcome | null,
  levelShown: boolean,
  hasThreshold: boolean,
): string | null {
  if (grade === null) return null
  if (grade.kind !== 'graded') return hasThreshold ? notGradedText(grade) : null
  if (levelShown) return null
  // The range and the estimate are one tap down, on the sport page's ladder, so the line keeps the level and the percent.
  const { level, value } = gradeParts(sport, grade.grade, 'row')
  return `${level} · ${value} at threshold.`
}

/** A ride's figures wait for the weight. */
export function needsWeight(sport: Sport, weighted: boolean): boolean {
  return sport === 'ride' && !weighted
}

export interface BareTileInput {
  sport: Sport
  result: AnalysisResult
  units: UnitSystem
  massKg: number
  grade: GradeOutcome | null
  weighted: boolean
  needInHeadline?: boolean
  levelShown?: boolean
}

/**
 * A tile that would hold only its name: no figure, and the page's headline already says what the threshold needs,
 * with no grade line to give. It is left out rather than drawn empty.
 */
export function thresholdTileIsBare({
  sport,
  result,
  units,
  massKg,
  grade,
  weighted,
  needInHeadline = false,
  levelShown = false,
}: BareTileInput): boolean {
  if (!needInHeadline || needsWeight(sport, weighted)) return false
  if (threshold(result, sport, massKg, units) !== null) return false
  return gradeLine(sport, grade, levelShown, false) === null
}
