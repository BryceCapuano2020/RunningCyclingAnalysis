import type { SameHeartRate } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { sameHeartRateCopy } from '../sameHeartRateCopy'
import { lackLine } from './lackLine'

/** The section's name, in its heading and in the page's "Not enough yet" list. */
export const SAME_HEART_RATE_NAME = 'At the same heart rate'

/**
 * Why there is no reading to draw, as a "Not enough yet" line, or null when there is a chart. Too few weeks
 * to name a change still has a chart, so it is not a lack.
 */
export function sameHeartRateLack(
  sport: Sport,
  data: SameHeartRate,
  units: UnitSystem,
): string | null {
  const copy = sameHeartRateCopy(sport, data, units)
  return copy.kind === 'missing' && data.change === null
    ? lackLine(SAME_HEART_RATE_NAME, copy.text)
    : null
}

/** The section's name once the fitness status above it speaks: it is the weekly view, not the verdict. */
export const SAME_HEART_RATE_WEEKLY_NAME = 'Same heart rate, week by week'

/** What the closed row says then: what is drawn, and where the verdict is. It names no change, so the two never disagree. */
export function weeklyFinding(sport: Sport, referenceHr: number | null): string {
  const output = SPORT_WEEKLY_OUTPUT[sport]
  return `Your ${output} each week${referenceHr === null ? '' : ` at ${referenceHr} bpm`}. Your fitness status above is read from steady runs over longer stretches.`
}

/** What each sport's weekly reading is of. */
const SPORT_WEEKLY_OUTPUT: Record<Sport, string> = { run: 'pace', ride: 'power' }
