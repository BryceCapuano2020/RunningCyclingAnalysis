import type { EstimatedPower, PowerHeartRate } from '@rca/core/digest'
import { isHardShare } from '@rca/core/effort'
import type { Property } from '../components/property'

/*
 * A ride whose power no rider holds at the athlete's weight (`ActivitySummary.powerCheck`). The core leaves it out
 * of every best until the athlete keeps it; this is what the pages say about it.
 */

/** The mark on a list row and an activity's header. */
export const POWER_SET_ASIDE_CHIP = 'Power set aside'
export const POWER_KEPT_CHIP = 'Power kept'

/** The title and line when the period’s rides were set aside and left no ride to compare. */
export const POWER_IMPLAUSIBLE_TITLE = 'Your ride power looks implausible'
export const POWER_IMPLAUSIBLE_REASON =
  'Power on your rides is above what riders hold at your weight, so they are set aside and left out of your bests, grades and the balance. Worth checking: power meter calibration, your weight setting, or an e-bike ride logged as a ride.'
export const POWER_IMPLAUSIBLE_ACTION = 'Each ride’s page lets you keep its power.'
export const POWER_IMPLAUSIBLE_TEXT = `${POWER_IMPLAUSIBLE_REASON} ${POWER_IMPLAUSIBLE_ACTION}`

export const KEEP_POWER_LABEL = 'Keep this power'
export const SET_POWER_ASIDE_LABEL = 'Set this power aside'

/** The chip an activity carries for its power check, or null when its power is not in question. */
export function powerCheckChip(check: 'set-aside' | 'kept' | undefined): string | null {
  if (check === undefined) return null
  return check === 'kept' ? POWER_KEPT_CHIP : POWER_SET_ASIDE_CHIP
}

/** A length of effort in words: whole minutes from two minutes, seconds under. Never "0 min". */
function lengthText(durationS: number): string {
  return durationS < 120 ? `${Math.round(durationS)} s` : `${Math.round(durationS / 60)} min`
}

/** What to check when a ride's power is higher than riders hold, as a row's value. */
const CHECK_METER = 'Meter calibration, weight setting, e-bike logged as a ride'
const CHECK_ESTIMATE = 'Assisted bike, a tow, weight setting'

/**
 * The rows of an activity page's power check, label over value: the state, what it is left out of or counts in, the
 * best effort of an estimate with no meter, and the heart rate over the questioned effort. The heart rate is a
 * fact beside the power; it does not say the power was right or wrong.
 */
export function powerCheckRows(
  check: 'set-aside' | 'kept',
  estimate: EstimatedPower | undefined,
  heartRate: PowerHeartRate | undefined,
): Property[] {
  const kept = check === 'kept'
  return [
    { label: 'Power', value: kept ? 'Kept' : 'Set aside' },
    ...(estimate === undefined
      ? []
      : [
          { label: 'Power source', value: 'Estimated from speed and climbs' },
          {
            label: `Best ${lengthText(estimate.durationS)}`,
            value: `${estimate.wkg.toFixed(1)} W/kg`,
          },
        ]),
    kept
      ? { label: 'Counts in', value: 'Bests and thresholds' }
      : { label: 'Left out of', value: 'Bests, grades and the balance' },
    kept
      ? { label: 'At the top of the age tables', value: 'Left out of the comparison with running' }
      : { label: 'Check', value: estimate === undefined ? CHECK_METER : CHECK_ESTIMATE },
    ...(heartRate === undefined
      ? []
      : [
          {
            label: `Heart rate, best ${Math.round(heartRate.durationS / 60)} min`,
            value: `${Math.round(heartRate.heartRateShare * 100)}% of reference`,
          },
          {
            label: 'Heart rate reads',
            value: isHardShare(heartRate.heartRateShare)
              ? 'As high as a hard effort'
              : 'Lower than a hard effort at that power',
          },
        ]),
  ]
}
