import { PRIORS } from '../constants'
import { flatSpeedToMetabolic, metabolicToFlatSpeed } from '../metabolic'
import type { Sport } from '../types'
import {
  HOUR_S,
  RIDE_SHORTEST_EFFORT_S,
  RUN_SHARE,
  RUN_SHORTEST_EFFORT_S,
  RUN_VO2,
} from './constants'
import { durationRatio, ratioSpread } from './durationRatio'

/**
 * How a sport's best for a time relates to its threshold, for an athlete who gave it all: what threshold a best implies
 * (`threshold`), what best an athlete of a threshold holds (`held`, its inverse), and how far the ratio between the two varies
 * between athletes, as a share (`spread`; squared, the variance a best's estimate carries). All read seconds, and values in the
 * sport's curve unit. A threshold is what is held for an hour, so `threshold(value, 3600)` is `value` for every sport. A ride's
 * is a multiple of its power; a run's goes through speed (`runThresholdOf`), so what a best implies depends on its value as well
 * as its length. `shortestS` is the shortest best the sport's threshold reads: a shorter one is left out (3 min for a ride, 8 min
 * for a run, whose short training bests are strides, hills and GPS noise).
 */
export interface DurationTable {
  shortestS: number
  threshold(value: number, durationS: number): number
  held(threshold: number, durationS: number): number
  spread(durationS: number): number
}

/** The share of VO2max a runner holds for `minutes` (Daniels and Gilbert). The one place the formula is written. */
export function shareOfVo2max(minutes: number): number {
  const { floor, slow, fast } = RUN_SHARE
  return (
    floor +
    slow.weight * Math.exp(-slow.rate * minutes) +
    fast.weight * Math.exp(-fast.rate * minutes)
  )
}

const HOUR_SHARE = shareOfVo2max(HOUR_S / 60)

/**
 * A runner's ratio of VO2: the share of VO2max held for the time over the share held for an hour, 1.229 at 5 min, 1.137 at 10,
 * 1.073 at 20, 1.029 at 40 and 1.000 at 60. It is a ratio of oxygen cost, not of the run curve's gross metabolic W/kg (which is
 * linear in speed, where the cost is not), so it is applied to the cost of the speed (`runThresholdOf`). It keeps falling past
 * an hour, as a ride's does.
 */
export function runDurationRatio(durationS: number): number {
  return shareOfVo2max(durationS / 60) / HOUR_SHARE
}

const economy = PRIORS.runEconomyScale.mean

/** Daniels and Gilbert's oxygen cost of running at `metresPerMin`, ml/kg/min. The one place the formula is written. */
export function runVo2PerMin(metresPerMin: number): number {
  return (
    RUN_VO2.constant + RUN_VO2.linear * metresPerMin + RUN_VO2.square * metresPerMin * metresPerMin
  )
}

/** Daniels and Gilbert's oxygen cost of running at `speedMs`, ml/kg/min. Negative below a walk. */
export function runVo2(speedMs: number): number {
  return runVo2PerMin(speedMs * 60)
}

/** The speed, m/s, with the oxygen cost `vo2`: the positive root of `runVo2`. NaN under the cost of standing still. */
export function runSpeedAt(vo2: number): number {
  const { constant, linear, square } = RUN_VO2
  const root = linear * linear + 4 * square * (vo2 - constant)
  return vo2 < constant || root < 0 ? Number.NaN : (Math.sqrt(root) - linear) / (2 * square * 60)
}

/**
 * The oxygen cost of the speed a run's gross metabolic W/kg is, or NaN where that is not a run (a walk's cost is at or under 0,
 * and the curve's gross unit holds a resting part that no speed has under it).
 */
function costOf(wkg: number): number {
  const vo2 = runVo2(metabolicToFlatSpeed(wkg, economy))
  return vo2 > 0 ? vo2 : Number.NaN
}

const wkgAt = (vo2: number) => flatSpeedToMetabolic(runSpeedAt(vo2), economy)

/**
 * The threshold a run's best implies, in the run curve's unit: the best's speed on the flat, its oxygen cost, that cost over the
 * ratio for its length (the cost at the pace of the hour, since a share of VO2max is a share of that cost), and back to speed and
 * W/kg. NaN where the best is not a run's speed.
 */
export function runThresholdOf(wkg: number, durationS: number): number {
  return wkgAt(costOf(wkg) / runDurationRatio(durationS))
}

/** The best a runner of a given threshold holds for a time, the inverse of `runThresholdOf`. */
export function runHeldAt(threshold: number, durationS: number): number {
  return wkgAt(costOf(threshold) * runDurationRatio(durationS))
}

const RIDE_TABLE: DurationTable = {
  shortestS: RIDE_SHORTEST_EFFORT_S,
  threshold: (value, durationS) => value / durationRatio(durationS),
  held: (threshold, durationS) => threshold * durationRatio(durationS),
  spread: ratioSpread,
}
// The runners' spread starts from the riders' and moves only on the evidence of the running simulation.
const RUN_TABLE: DurationTable = {
  shortestS: RUN_SHORTEST_EFFORT_S,
  threshold: runThresholdOf,
  held: runHeldAt,
  spread: ratioSpread,
}

/** Each sport's table. A sport added to `Sport` has to say how its bests scale before it can have a threshold. */
export const DURATION_TABLES: Record<Sport, DurationTable> = { run: RUN_TABLE, ride: RIDE_TABLE }
