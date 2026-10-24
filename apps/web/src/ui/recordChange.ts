import type { Sport } from '@rca/core/types'
import { PACE_UNIT, formatRecordTime, paceSeconds } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'

/**
 * How a record moved against the same record in the period before, in words: "0:12 /mi faster than
 * previous 6 weeks" or "8 W more than previous 6 weeks". A run is compared in pace, to the second, so
 * a figure that rounds the same reads "Same as". Null when the earlier period has no figure.
 *
 * `now` and `before` are in the sport's own unit: a running flat speed in m/s, or cycling watts.
 */
export function recordChange(
  sport: Sport,
  now: number,
  before: number,
  units: UnitSystem,
  previousLabel: string,
): string | null {
  if (!Number.isFinite(now) || !Number.isFinite(before)) return null
  const earlier = previousLabel.toLowerCase()
  if (sport === 'run') {
    // Each pace is taken to the whole second the page shows, then the two are compared.
    const shownNow = Math.round(paceSeconds(now, units))
    const shownBefore = Math.round(paceSeconds(before, units))
    // A pace is shorter when faster, so the gain is the earlier pace minus the current one.
    const gain = shownBefore - shownNow
    if (gain === 0) return `Same as ${earlier}`
    const way = gain > 0 ? 'faster' : 'slower'
    return `${formatRecordTime(Math.abs(gain))} ${PACE_UNIT[units]} ${way} than ${earlier}`
  }
  const watts = Math.round(now) - Math.round(before)
  if (watts === 0) return `Same as ${earlier}`
  return `${Math.abs(watts)} W ${watts > 0 ? 'more' : 'less'} than ${earlier}`
}
