import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { HEADLINE_LABEL } from './grades'
import { valueAt } from './records'

/** The fitted threshold and the best headline effort in one unit, gross metabolic W/kg, which the fit is made in. */
const BEST_AND_THRESHOLD: Record<Sport, (result: AnalysisResult) => [number, number | null]> = {
  run: (result) => [valueAt(result.runCurve, HEADLINE_DURATION_S), result.runCp?.cp ?? null],
  ride: (result) => [
    valueAt(result.rideMetabolicCurve, HEADLINE_DURATION_S),
    result.rideCp?.cp ?? null,
  ],
}

/** How each sport words a best that beats its threshold: a pace is faster, a power is higher. */
const BEATS: Record<Sport, string> = { run: 'faster', ride: 'higher' }

/**
 * The line that sets a sport's best 20 minutes beside its threshold, which is the lower figure of the two:
 * "Your best 20 min was faster: 6:37 /mi". Null unless the fit holds a threshold and the best sits above it,
 * so a figure that is not the larger is never described as if it were.
 */
export function bestBeyondThresholdLine(
  result: AnalysisResult,
  sport: Sport,
  effort: string | null,
): string | null {
  if (effort === null) return null
  const [best, threshold] = BEST_AND_THRESHOLD[sport](result)
  if (threshold === null || !(best > threshold)) return null
  return `Your best ${HEADLINE_LABEL} was ${BEATS[sport]}: ${effort.replace(', estimated', ' (estimated)')}`
}
