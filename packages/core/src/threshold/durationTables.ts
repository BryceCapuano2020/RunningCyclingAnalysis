import type { Sport } from '../types'
import { HOUR_S, RUN_SHARE } from './constants'
import { durationRatio, ratioSpread } from './durationRatio'

/**
 * How a sport's best for a time relates to its threshold, for an athlete who gave it all: the `ratio` (a best over it is the
 * threshold the best implies) and how far that ratio varies between athletes, as a share (`spread`; squared, the variance a
 * best's estimate carries). Both read seconds. The ratio is 1.00 at an hour for every sport: the threshold is the pace or
 * power held for an hour.
 */
export interface DurationTable {
  ratio(durationS: number): number
  spread(durationS: number): number
}

/** The share of VO2max a runner holds for `minutes` (Daniels and Gilbert). */
function shareOfVo2max(minutes: number): number {
  const { floor, slow, fast } = RUN_SHARE
  return (
    floor +
    slow.weight * Math.exp(-slow.rate * minutes) +
    fast.weight * Math.exp(-fast.rate * minutes)
  )
}

/**
 * A runner's ratio: the share of VO2max held for the time over the share held for an hour, 1.229 at 5 min, 1.137 at 10, 1.073
 * at 20, 1.029 at 40 and 1.000 at 60. It is applied to the run curve's unit, gross metabolic W/kg, since a share of VO2max is a
 * share of gross metabolic rate. It keeps falling past an hour, as a ride's does.
 */
export function runDurationRatio(durationS: number): number {
  return shareOfVo2max(durationS / 60) / shareOfVo2max(HOUR_S / 60)
}

const RIDE_TABLE: DurationTable = { ratio: durationRatio, spread: ratioSpread }
// The runners' spread starts from the riders' and moves only on the evidence of the running simulation.
const RUN_TABLE: DurationTable = { ratio: runDurationRatio, spread: ratioSpread }

/** Each sport's table. A sport added to `Sport` has to say how its bests scale before it can have a threshold. */
export const DURATION_TABLES: Record<Sport, DurationTable> = { run: RUN_TABLE, ride: RIDE_TABLE }
