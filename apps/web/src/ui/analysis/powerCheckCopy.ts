import type { EstimatedPower, PowerHeartRate } from '@rca/core/digest'
import { isHardShare } from '@rca/core/effort'

/*
 * A ride whose power no rider holds at the athlete's weight (`ActivitySummary.powerCheck`). The core leaves it out
 * of every best until the athlete keeps it; this is what the pages say about it.
 */

/** The mark on a list row and an activity's header. */
export const POWER_SET_ASIDE_CHIP = 'Power set aside'
export const POWER_KEPT_CHIP = 'Power kept'

/** The line on an activity page while its power is set aside: what was done, and what to check as possibilities. */
export const POWER_SET_ASIDE_NOTE =
  'This ride’s power is higher than riders hold for these lengths at your weight, so it is left out of your bests, grades and the balance. Worth checking: power meter calibration, your weight setting, or an e-bike ride logged as a ride.'

/**
 * The line once the athlete has kept it: what keeping changes (the ride counts toward the bests, the
 * thresholds and the fitness figures) and what it does not (a ride at the top of the age tables stays out of the comparison).
 */
export const POWER_KEPT_NOTE =
  'You chose to keep this ride’s power, so it counts in your bests and thresholds. If it puts your cycling at the top of what the age tables cover, it is still left out of the comparison with your running.'

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

/**
 * The line on an activity page while the power of a ride without a meter is set aside: what was seen (the estimate from
 * speed and climbs needs more than riders hold), what else would show it, and the action. It does not say the ride was assisted.
 */
export function estimatedPowerNote(estimate: EstimatedPower): string {
  return `This ride has no power meter, so its power is estimated from your speed and the climbs. Over its best ${lengthText(estimate.durationS)} the estimate needs ${estimate.wkg.toFixed(1)} W/kg, more than riders hold at your weight, so it is left out of your bests, grades and the balance. An assisted bike, a tow or a wrong weight setting would read like this. If you rode it unassisted, keep its power.`
}

/**
 * What the heart rate over the questioned effort shows, as a fact beside the power: the share of the athlete's reference
 * heart rate it averaged, and whether that is as high as a hard effort reads. It does not say the power was right or wrong.
 */
export function powerHeartRateNote(evidence: PowerHeartRate): string {
  const minutes = Math.round(evidence.durationS / 60)
  const share = Math.round(evidence.heartRateShare * 100)
  const seen = `Over its best ${minutes} min, at ${evidence.wkg.toFixed(1)} W/kg, your heart rate averaged ${share}% of your reference heart rate.`
  const reading = isHardShare(evidence.heartRateShare)
    ? 'That is as high as a hard effort reads.'
    : 'That is lower than an effort at that power usually shows.'
  return `${seen} ${reading} Heart rate cannot say whether the power was right.`
}
