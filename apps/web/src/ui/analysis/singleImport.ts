import type { Sport } from '@rca/core/types'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { ImportOutcome } from '../../worker/protocol'
import { formatGrade } from '../gradeFormat'
import type { AgeProfile } from '../grades'
import { thresholdGrades } from '../thresholdGrade'
import { NO_HALF } from '../runHalf'
import type { HalfOf } from '../runHalf'
import { SPORT_LABEL, SPORT_ORDER } from '../sports'
import type { MovedItem } from './whatMoved'

/** The count of activities an import added, by sport. */
const ADDED_COUNT: Record<Sport, 'runs' | 'rides'> = { run: 'runs', ride: 'rides' }

/** A sport's grade at its threshold waits for a weight, since a ride's figures are worked out from the placeholder. */
const GRADE_WAITS_FOR_WEIGHT: Record<Sport, boolean> = { run: false, ride: true }

/** The sport of the one activity an import added, or null when it added none, or more than one. */
export function addedSportOf(outcome: Pick<ImportOutcome, 'runs' | 'rides'>): Sport | null {
  const counts = SPORT_ORDER.map((sport) => ({ sport, count: outcome[ADDED_COUNT[sport]] ?? 0 }))
  if (counts.reduce((sum, { count }) => sum + count, 0) !== 1) return null
  return counts.find(({ count }) => count === 1)?.sport ?? null
}

/**
 * The sport's age grade, the grade the Balance page states (a run's by its forecast half, `halfOf`, where it has one), when both results grade it and its whole percent
 * changed, such as "Ride grade: 54% → 57%". Null without a profile, without a weight for a ride, or without a
 * grade on both sides.
 */
export function thresholdGradeItem(
  before: AnalysisResult,
  after: AnalysisResult,
  sport: Sport,
  profile: AgeProfile | null,
  weighted: boolean,
  halfOf: HalfOf = NO_HALF,
): MovedItem | null {
  if (profile === null || (GRADE_WAITS_FOR_WEIGHT[sport] && !weighted)) return null
  const from = thresholdGrades(before, profile, halfOf(before))[sport]
  const to = thresholdGrades(after, profile, halfOf(after))[sport]
  if (from.kind !== 'graded' || to.kind !== 'graded') return null
  const fromText = formatGrade(from.grade.centre.grade)
  const toText = formatGrade(to.grade.centre.grade)
  if (fromText === toText) return null
  const label = `${SPORT_LABEL[sport]} grade`
  return {
    text: `${label}: ${fromText} → ${toText}`,
    spoken: `${label} from ${fromText} to ${toText}`,
  }
}
