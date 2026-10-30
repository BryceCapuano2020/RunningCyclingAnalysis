import { CP_FIT_MAX_S, CP_FIT_MIN_S } from '@rca/core/constants'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { curveOf, refusalOf } from './records'
import { thresholdNeedsText } from './sports'
import { thresholdWithheldLine } from './thresholdWithheld'

/**
 * The longest effort a sport holds inside the threshold fit's window, s; null when it holds none. It says what
 * a missing threshold has to go on.
 */
export function longestFitEffortS(result: AnalysisResult, sport: Sport): number | null {
  let longest: number | null = null
  for (const point of curveOf(result, sport)) {
    const inWindow = point.durationS >= CP_FIT_MIN_S && point.durationS <= CP_FIT_MAX_S
    if (
      inWindow &&
      Number.isFinite(point.value) &&
      (longest === null || point.durationS > longest)
    ) {
      longest = point.durationS
    }
  }
  return longest
}

/** The line in a missing threshold's place: what the sport's fit lacks, and the longest effort it has to go on. */
export function thresholdNeedsLine(result: AnalysisResult, sport: Sport): string {
  return (
    thresholdWithheldLine(result, sport) ??
    thresholdNeedsText(refusalOf(result, sport), longestFitEffortS(result, sport))
  )
}
