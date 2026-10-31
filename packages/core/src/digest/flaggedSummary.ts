import type { ActivityDigest } from '../types'
import { estimatedPowerOver } from './estimatedPower'
import type { Masses } from './masses'
import { powerCheckOf } from './powerCheck'
import type { ActivitySummary } from './summary'

/**
 * A ride's summary with its power check when its power is in question, and for a ride without a meter what its estimate
 * needs. A flagged ride gets its own copy; the cached summary is shared and stays as it is. Without masses the power is
 * not judged.
 */
export function flagged(
  summary: ActivitySummary,
  digest: Pick<ActivityDigest, 'curve' | 'sport' | 'startMs' | 'id'>,
  masses: Masses | null,
): ActivitySummary {
  const check = masses === null ? undefined : powerCheckOf(digest as ActivityDigest, masses)
  if (masses === null || check === undefined) return summary
  const found = estimatedPowerOver(digest, masses)
  return Object.assign(
    {},
    summary,
    { powerCheck: check },
    found === undefined ? {} : { estimatedPower: found },
  )
}
