import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { AnalysisResult } from '@rca/core/pipeline'
import { isTopOfScale } from './grades'
import type { GradeOutcome } from './grades'
import { countEfforts } from './records'

/**
 * Why the ride is not in the comparison with the run. At the top of the scale its grade is capped at 100% and
 * says so, and it is no fault in the input. Implausible power is the pro ceiling, named only when it is the whole
 * reason there is no ride grade: every ride in the period long enough for the headline has its power set aside.
 */
export type RideLeftOut = 'top-of-scale' | 'implausible-power'

/** The reason the ride is left out of the comparison, or null when it takes part. */
export function rideLeftOut(ride: GradeOutcome | null, result: AnalysisResult): RideLeftOut | null {
  if (isTopOfScale(ride)) return 'top-of-scale'
  if (ride?.kind !== 'gap') return null
  // Only a ride has a power check, so counting the set-aside ones counts rides.
  const setAside = result.activities.filter(
    (activity) => activity.powerCheck === 'set-aside' && activity.durationS >= HEADLINE_DURATION_S,
  ).length
  return setAside > 0 && setAside >= countEfforts(result.activities, 'ride')
    ? 'implausible-power'
    : null
}
