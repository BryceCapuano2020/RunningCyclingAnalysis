import type { ChangeVerdict } from '@rca/core/change/types'
import type { Sport } from '@rca/core/types'
import { PACE_UNIT, formatPower, formatRecordTime, paceSeconds } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'

/**
 * How a record moved against the same record in the period before, in words: "0:12 /mi faster than
 * previous 6 weeks" or "8 W more than previous 6 weeks". Whether it moved is the change test's verdict for the
 * record's effort length: a figure inside what chance puts between the two periods, or one that rounds the same on
 * the page, reads "No clear change from"; a length the test could not judge (too few efforts in either period)
 * reads nothing. Null also when the earlier period has no figure.
 *
 * `now` and `before` are in the sport's own unit, which writes the amount: a running flat speed in m/s, or cycling watts.
 */
export function recordChange(
  sport: Sport,
  now: number,
  before: number,
  units: UnitSystem,
  previousLabel: string,
  verdict: ChangeVerdict,
): string | null {
  if (!Number.isFinite(now) || !Number.isFinite(before) || verdict === 'untested') return null
  const earlier = previousLabel.toLowerCase()
  const none = `No clear change from ${earlier}`
  if (verdict === 'none') return none
  if (sport === 'run') {
    // Each pace is taken to the whole second the page shows, then the two are compared.
    const shownNow = Math.round(paceSeconds(now, units))
    const shownBefore = Math.round(paceSeconds(before, units))
    // A pace is shorter when faster, so the gain is the earlier pace minus the current one.
    const gain = shownBefore - shownNow
    if (gain === 0) return none
    const way = gain > 0 ? 'faster' : 'slower'
    return `${formatRecordTime(Math.abs(gain))} ${PACE_UNIT[units]} ${way} than ${earlier}`
  }
  const watts = Math.round(now) - Math.round(before)
  if (watts === 0) return none
  return `${formatPower(Math.abs(watts))} ${watts > 0 ? 'more' : 'less'} than ${earlier}`
}
