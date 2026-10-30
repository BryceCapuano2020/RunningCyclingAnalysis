import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { effortsCount } from '@rca/core/digest'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
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
 * threshold, and a best 20 minutes that heart rate does not show to be easy. A sport known only from shorter
 * efforts, such as one estimated 5 minute ride, says too little about its level to be set against the other; one
 * whose best 20 minutes was not a hard effort (the effort gate) says what it held, not what it can do, and
 * setting it against the other sport would read an easy week as a level. That is a hold, not a change to the rule
 * that reads the gap once both are there.
 */
export function hasEvidence(result: AnalysisResult, sport: Sport): boolean {
  if (result.effortGate[sport].verdict === 'notHard') return false
  const { curve, threshold } = EVIDENCE_OF[sport](result)
  return threshold !== null || reachesHeadline(curve)
}

/** Whether both sports have the evidence the headline needs: an effort of its length, or a fitted threshold. */
export function hasHeadlineEvidence(result: AnalysisResult): boolean {
  return hasEvidence(result, 'run') && hasEvidence(result, 'ride')
}

/** Each sport's best curve and fitted threshold in a result. */
const EVIDENCE_OF: Record<Sport, (result: AnalysisResult) => { curve: Curve; threshold: unknown }> =
  {
    run: (result) => ({ curve: result.runCurve, threshold: result.runCp }),
    ride: (result) => ({ curve: result.rideCurve, threshold: result.rideCp }),
  }

/** The analysed activities each sport needs in the period before the headline sets one against the other. */
export const HEADLINE_MIN_ACTIVITIES = 3

/**
 * How many more analysed activities each sport needs in the period before the headline can compare them,
 * 0 for a sport that has enough. One run set against three rides is a comparison of a day against a month.
 * A treadmill run is in the period's volume but is not counted here, since its pace holds no best.
 */
export function headlineShortfall(activities: ActivitySummary[]): Record<Sport, number> {
  const missing = (sport: Sport) => {
    const have = activities.filter((a) => a.sport === sport && effortsCount(a)).length
    return Math.max(0, HEADLINE_MIN_ACTIVITIES - have)
  }
  return { run: missing('run'), ride: missing('ride') }
}

/**
 * The headline's comparison point, or null when either sport lacks the evidence for it: a hard enough
 * effort (see hasEvidence) or enough activities in the period (see headlineShortfall). The page then says
 * what is missing instead of a gap taken from a few minutes, or a few days, of one sport.
 */
export function headlinePick(result: AnalysisResult): HeadlinePick | null {
  if (!hasHeadlineEvidence(result)) return null
  const short = headlineShortfall(result.activities)
  if (short.run > 0 || short.ride > 0) return null
  return pickHeadline(result.comparison)
}
