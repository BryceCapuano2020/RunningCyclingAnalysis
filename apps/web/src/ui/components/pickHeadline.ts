import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Comparison, ComparisonPoint, Curve, Sport } from '@rca/core/types'

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

/** Whether a best curve holds an effort of at least the headline duration. */
function reachesHeadline(curve: Curve): boolean {
  return curve.some(
    (point) => point.durationS >= HEADLINE_DURATION_S && Number.isFinite(point.value),
  )
}

/**
 * Whether a sport has the evidence the headline needs: an effort as long as the headline's, or a fitted
 * threshold. A sport known only from shorter efforts, such as one estimated 5 minute ride, says too little
 * about its level to be set against the other.
 */
function hasEvidence(result: AnalysisResult, sport: Sport): boolean {
  const { curve, threshold } = EVIDENCE_OF[sport](result)
  return threshold !== null || reachesHeadline(curve)
}

/** Each sport's best curve and fitted threshold in a result. */
const EVIDENCE_OF: Record<Sport, (result: AnalysisResult) => { curve: Curve; threshold: unknown }> =
  {
    run: (result) => ({ curve: result.runCurve, threshold: result.runCp }),
    ride: (result) => ({ curve: result.rideCurve, threshold: result.rideCp }),
  }

/**
 * The headline's comparison point, or null when either sport lacks the evidence for it (see hasEvidence):
 * the page then says what is missing instead of a gap taken from a few minutes of one sport.
 */
export function headlinePick(result: AnalysisResult): HeadlinePick | null {
  if (!hasEvidence(result, 'run') || !hasEvidence(result, 'ride')) return null
  return pickHeadline(result.comparison)
}
