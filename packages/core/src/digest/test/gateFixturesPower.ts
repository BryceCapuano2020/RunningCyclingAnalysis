import type { Activity } from '../../types'
import { syntheticActivity } from './syntheticActivity'

/**
 * Synthetic rides that each reach one gated power rule (revision 7): a half-hour at a steady 250 W with one second
 * altered. Used by the gate's identity test and by the rules' own tests.
 */

export const POWER_RIDE_N = 1800
export const POWER_RIDE_AT = 900

/** A steady half-hour ride on a power meter; `change` alters its power before it is built. */
export function powerRide(id: string, change: (power: Float64Array) => void): Activity {
  const power = new Float64Array(POWER_RIDE_N).fill(250)
  change(power)
  return syntheticActivity({
    id,
    sport: 'ride',
    n: POWER_RIDE_N,
    power,
    speed: new Float64Array(POWER_RIDE_N).fill(8),
  })
}

/** One second at 1,500 W in a ride at 250 W: under the 2,000 W rule, so nothing flags it before revision 7. */
export const loneSpikeRide = () =>
  powerRide('lone-spike', (power) => {
    power[POWER_RIDE_AT] = 1500
  })

/** One second the meter did not report. */
export const droppedSecondRide = () =>
  powerRide('dropped-second', (power) => {
    power[POWER_RIDE_AT] = Number.NaN
  })
