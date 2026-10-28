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
