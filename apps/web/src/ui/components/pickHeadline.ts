import { HEADLINE_MIN_ACTIVITIES, hasEvidence, headlineShortfall } from '@rca/core/answer'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { AnalysisResult } from '@rca/core/pipeline'
import { SPORTS } from '@rca/core/types'
import type { Comparison, ComparisonPoint } from '@rca/core/types'

export interface HeadlinePick {
  point: ComparisonPoint
  /** True when the point comes from the heart-rate calibrated comparison. */
  calibrated: boolean
}

/**
 * The comparison point the headline describes: 20 minutes when present, otherwise the duration
 * closest to it on a log scale. The heart-rate calibrated comparison is used when available.
 */
export function pickHeadline(comparison: Comparison): HeadlinePick | null {
  const calibrated = comparison.calibrated !== null
  const points = comparison.calibrated ?? comparison.prior
  let best: ComparisonPoint | null = null
  let bestDistance = Infinity
  for (const point of points) {
    const distance = Math.abs(Math.log(point.durationS) - Math.log(HEADLINE_DURATION_S))
    if (distance < bestDistance) {
      best = point
      bestDistance = distance
    }
  }
  return best === null ? null : { point: best, calibrated }
}

/** Whether both sports have the evidence the headline needs: an effort of its length, or a fitted threshold. */
export function hasHeadlineEvidence(result: AnalysisResult): boolean {
  return SPORTS.every((sport) => hasEvidence(result, sport))
}

// The rule is core's (answer/evidence.ts), which the search for the default window reads too.
export { HEADLINE_MIN_ACTIVITIES, hasEvidence, headlineShortfall }

/**
 * The headline's comparison point, or null when either sport lacks the evidence for it: a hard enough
 * effort (see hasEvidence) or enough activities in the period (see headlineShortfall). The page then says
 * what is missing instead of a gap taken from a few minutes, or a few days, of one sport.
 */
export function headlinePick(result: AnalysisResult): HeadlinePick | null {
  if (!hasHeadlineEvidence(result)) return null
  const short = headlineShortfall(result.activities)
  if (SPORTS.some((sport) => short[sport] > 0)) return null
  return pickHeadline(result.comparison)
}
