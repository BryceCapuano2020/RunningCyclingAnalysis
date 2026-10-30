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
export const POWER_IMPLAUSIBLE_TEXT =
  'Power on your rides is above what riders hold at your weight, so they are set aside and left out of your bests, grades and the balance. Worth checking: power meter calibration, your weight setting, or an e-bike ride logged as a ride. Each ride’s page lets you keep its power.'

export const KEEP_POWER_LABEL = 'Keep this power'
export const SET_POWER_ASIDE_LABEL = 'Set this power aside'

/** The chip an activity carries for its power check, or null when its power is not in question. */
export function powerCheckChip(check: 'set-aside' | 'kept' | undefined): string | null {
  if (check === undefined) return null
  return check === 'kept' ? POWER_KEPT_CHIP : POWER_SET_ASIDE_CHIP
}
