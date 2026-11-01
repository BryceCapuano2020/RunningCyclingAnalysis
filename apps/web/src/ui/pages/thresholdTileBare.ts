import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { HEADLINE_LABEL, gradeParts, notGradedText } from '../grades'
import type { GradeOutcome } from '../grades'
import { CHIP_DURATIONS_S, headlineEffort, sportRecords, threshold } from '../records'
import { floorThreshold } from '../thresholdFloor'

/**
 * The grade line under the figure: the level and grade, and the best effort it rests on. Where the levels row
 * already says the level and grade, it keeps only the effort, so a level is said once on the screen.
 */
export function gradeLine(
  sport: Sport,
  grade: GradeOutcome | null,
  effort: string | null,
  levelShown: boolean,
): string | null {
  if (grade === null) return null
  if (grade.kind !== 'graded') return notGradedText(grade)
  if (levelShown) return effort === null ? null : `Best ${HEADLINE_LABEL}: ${effort}`
  const { level, value, range } = gradeParts(sport, grade.grade, 'row')
  const figure = `${value}${range === null ? '' : ` (${range})`}`
  const grades = level === null ? figure : `${level} · ${figure}`
  return `${grades} on your best ${HEADLINE_LABEL}${effort === null ? '' : `, ${effort}`}.`
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
  if (floorThreshold(result, sport, massKg, units) !== null) return false
  const records = sportRecords(result, sport, massKg, units).filter((record) =>
    CHIP_DURATIONS_S.includes(record.durationS),
  )
  return gradeLine(sport, grade, headlineEffort(sport, records), levelShown) === null
}
