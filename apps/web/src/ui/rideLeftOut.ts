import type { AnalysisResult } from '@rca/core/pipeline'
import { isTopOfScale } from './grades'
import type { GradeOutcome } from './grades'

/**
 * Why the ride is not in the comparison with the run. At the top of the scale its grade is capped at 100% and
 * says so, and it is no fault in the input. Implausible power is the pro ceiling: the period's rides whose power is
 * set aside left it with no ride best to grade.
 */
export type RideLeftOut = 'top-of-scale' | 'implausible-power'

/** The reason the ride is left out of the comparison, or null when it takes part. */
export function rideLeftOut(ride: GradeOutcome | null, result: AnalysisResult): RideLeftOut | null {
  if (isTopOfScale(ride)) return 'top-of-scale'
  const setAside = result.activities.some((activity) => activity.powerCheck === 'set-aside')
  return ride?.kind === 'gap' && setAside ? 'implausible-power' : null
}
