import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { AnalysisResult } from '@rca/core/pipeline'
import { POWER_IMPLAUSIBLE_ACTION, POWER_IMPLAUSIBLE_REASON } from './analysis/powerCheckCopy'
import { isTopOfScale } from './grades'
import type { GradeOutcome } from './grades'
import { countEfforts } from './records'
import type { HoldInputs } from './resultHold'

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

/**
 * The hold inputs for a reason the ride is out of the comparison, on top of `base` (what the app knows, such as the
 * held-out digests). The one place a ride's reason becomes a hold input: top of the scale leaves the ride out with no
 * fault to name (`rideAtTop`), implausible power is a hold with a reason and an action (`implausibleRide`).
 */
export function holdWithRideOut(left: RideLeftOut | null, base: HoldInputs = {}): HoldInputs {
  if (left === 'top-of-scale') return { ...base, rideAtTop: true }
  if (left === 'implausible-power') {
    return {
      ...base,
      implausibleRide: { text: POWER_IMPLAUSIBLE_REASON, action: POWER_IMPLAUSIBLE_ACTION },
    }
  }
  return base
}

/** The hold on a result's comparison with what the ride's grade adds to it, read through `heldPick` or `heldTexts`. */
export function rideHoldInputs(
  ride: GradeOutcome | null,
  result: AnalysisResult,
  base: HoldInputs = {},
): HoldInputs {
  return holdWithRideOut(rideLeftOut(ride, result), base)
}

/** The reason a ride is out of the comparison that these inputs carry, which the held balance names. */
export function rideOutOf(inputs: HoldInputs): RideLeftOut | null {
  if (inputs.rideAtTop === true) return 'top-of-scale'
  return inputs.implausibleRide ? 'implausible-power' : null
}
