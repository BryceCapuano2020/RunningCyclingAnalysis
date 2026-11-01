import { HEADLINE_DURATION_S } from '../constants'
import type { AnalysisResult } from '../digest/combine'
import { effortsCount } from '../digest/effortTrust'
import type { ActivitySummary } from '../digest/summary'
import { SPORTS } from '../types'
import type { Curve, Sport } from '../types'

/*
 * What a sport needs in a window before it can be set against another: enough activities, and a best as long as the
 * headline's (or a fitted threshold). The Balance headline and the search for the default window (window.ts) read the
 * same rule, so a window the search settles on is one the headline can compare in.
 */

/** The analysed activities each sport needs in the window before the headline sets one against the other. */
export const HEADLINE_MIN_ACTIVITIES = 3

/** Each sport's best curve and fitted threshold in a result. */
const EVIDENCE_OF: Record<Sport, (result: AnalysisResult) => { curve: Curve; threshold: unknown }> =
  {
    run: (result) => ({ curve: result.runCurve, threshold: result.runCp }),
    ride: (result) => ({ curve: result.rideCurve, threshold: result.rideCp }),
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
 * about its level to be set against the other. Whether that effort was hard is not asked here: it is a note
 * beside the comparison, not a condition of it.
 */
export function hasEvidence(result: AnalysisResult, sport: Sport): boolean {
  const { curve, threshold } = EVIDENCE_OF[sport](result)
  return threshold !== null || reachesHeadline(curve)
}

/**
 * How many more analysed activities each sport needs in the window before the headline can compare them,
 * 0 for a sport that has enough. One run set against three rides is a comparison of a day against a month.
 * A treadmill run is in the window's volume but is not counted here, since its pace holds no best.
 */
export function headlineShortfall(activities: ActivitySummary[]): Record<Sport, number> {
  const missing = (sport: Sport) => {
    const have = activities.filter((a) => a.sport === sport && effortsCount(a)).length
    return Math.max(0, HEADLINE_MIN_ACTIVITIES - have)
  }
  return Object.fromEntries(SPORTS.map((sport) => [sport, missing(sport)])) as Record<Sport, number>
}
