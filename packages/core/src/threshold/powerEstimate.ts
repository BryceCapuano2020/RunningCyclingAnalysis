import {
  ESTIMATED_WEIGHT,
  HALF_LIFE_DAYS,
  HOUR_AGREEMENT,
  NEAR_TOP_CENTRE,
  NEAR_TOP_WIDTH,
  POWER_MIN_ERROR,
} from './constants'
import { DURATION_TABLES } from './durationTables'
import type { DurationTable } from './durationTables'
import { fuse } from './fusion'
import { robustMeanOf } from './robustMean'
import { prepareFlat } from './rides'
import type { PreparedRide } from './rides'
import type { ThresholdEffort } from './types'

/** A ride's strongest effort, scaled to the threshold it implies. */
export interface RideEstimate {
  activityId: string
  durationS: number
  /** The threshold this effort implies (`DurationTable.threshold`): for a ride its value over the duration ratio. */
  value: number
  ageDays: number
  estimated: boolean
  /** The variance of the duration ratio at that duration (`DurationTable.spread` squared). */
  variance: number
}

export interface PowerEstimate {
  /** The mean of the rides' estimates, or the floor (a backed hour) where that is higher. */
  value: number
  /** The relative error, never under POWER_MIN_ERROR. */
  relativeError: number
  rides: number
  /** The ride with the highest estimate among those the mean kept; the ride of the floor where the floor is what sets `value`. */
  strongest: { activityId: string; durationS: number; estimated: boolean }
  /**
   * The hour the athlete did that backs a floor, or 0 for none. It is the best measured effort of an hour or longer in the
   * window (estimated watts are not an hour done, and age does not count against one) when a second hour is within 4% of it or
   * it is no higher than the 90th percentile of the mean of the rides' estimates; a lone hour above that is not believed, and the
   * second-best hour stands in (none without one). The answer and its low are never under it.
   */
  floor: number
}

/** A ride's hour, with the ride that held it. */
export interface Hour {
  activityId: string
  durationS: number
  value: number
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x))

/** The rides' strongest scaled efforts, each aged as the ride is. */
export function rideEstimates(
  efforts: readonly ThresholdEffort[],
  table: DurationTable = DURATION_TABLES.ride,
): RideEstimate[] {
  const { rides, ages } = prepareFlat(efforts, [], table)
  return rides.flatMap((ride, i) =>
    ride.best === null ? [] : [{ activityId: ride.activityId, ...ride.best, ageDays: ages[i]! }],
  )
}

/**
 * How much a ride's estimate counts: its recency, whether it sits near the top, whether the watts were measured, over the
 * variance of its duration ratio. `top` is the second-strongest ride's estimate (the strongest when there is one ride), so
 * a single odd file cannot set the bar the others are judged by.
 */
function weightOf(
  value: number,
  variance: number,
  estimated: boolean,
  ageDays: number,
  top: number,
): number {
  const recency = 0.5 ** (ageDays / HALF_LIFE_DAYS)
  const nearTop = logistic((value / top - NEAR_TOP_CENTRE) / NEAR_TOP_WIDTH)
  const measured = estimated ? ESTIMATED_WEIGHT : 1
  return (recency * nearTop * measured) / variance
}

export function rideWeight(ride: RideEstimate, top: number): number {
  return weightOf(ride.value, ride.variance, ride.estimated, ride.ageDays, top)
}

/**
 * The robust weighted mean of the strongest efforts of the rides from `lo` up to, not including, `hi`, each aged by `ages`
 * (days back from the newest activity of the set, never under 0). Null where no ride has an effort of the table's shortest, or none
 * has any weight. Each ride's strongest effort is worked out once (`PreparedRide`), so a window costs the mean alone.
 */
export function powerOver(
  rides: readonly PreparedRide[],
  ages: ArrayLike<number>,
  lo = 0,
  hi = rides.length,
): PowerEstimate | null {
  const at: number[] = []
  let top = -Infinity
  let second = -Infinity
  for (let i = lo; i < hi; i++) {
    const best = rides[i]!.best
    if (best === null) continue
    at.push(i)
    if (best.value > top) {
      second = top
      top = best.value
    } else if (best.value > second) second = best.value
  }
  if (at.length === 0) return null
  // The second-strongest ride, so one odd file cannot set the bar; the strongest where there is one ride.
  const bar = at.length === 1 ? top : second
  const values = new Float64Array(at.length)
  const weights = new Float64Array(at.length)
  at.forEach((ride, k) => {
    const best = rides[ride]!.best!
    values[k] = best.value
    weights[k] = weightOf(best.value, best.variance, best.estimated, Math.max(0, ages[ride]!), bar)
  })
  const mean = robustMeanOf(values, weights, values.length, true)
  if (mean === null) return null
  let strongest = -1
  for (let k = 0; k < at.length; k++) {
    if (mean.weights![k]! > 0 && (strongest < 0 || values[k]! > values[strongest]!)) strongest = k
  }
  if (strongest < 0) return null
  const { durationS, estimated } = rides[at[strongest]!]!.best!
  const relativeError = Math.max(mean.relativeError, POWER_MIN_ERROR)
  const hour = backedHour(rides, lo, hi, mean.value, relativeError)
  // A backed hour is a floor under the mean, and then the effort that sets the value, so it is the one named. It was measured.
  if (hour !== null && hour.value > mean.value) {
    return {
      value: hour.value,
      relativeError,
      rides: at.length,
      strongest: { activityId: hour.activityId, durationS: hour.durationS, estimated: false },
      floor: hour.value,
    }
  }
  return {
    value: mean.value,
    relativeError,
    rides: at.length,
    strongest: { activityId: rides[at[strongest]!]!.activityId, durationS, estimated },
    floor: hour?.value ?? 0,
  }
}

/**
 * The hour that backs a floor among the rides from `lo` up to, not including, `hi`: the best measured hour when a second hour is
 * within `HOUR_AGREEMENT` of it or it is no higher than the 90th percentile of the mean of the rides' estimates (`mean`, with
 * `relativeError`, which `fuse` reads the range from); else the second-best hour, or null with no hour to stand on. Every ride in
 * the window counts whatever its age: recency weights the mean and not the floor.
 */
export function backedHour(
  rides: readonly PreparedRide[],
  lo: number,
  hi: number,
  mean: number,
  relativeError: number,
): Hour | null {
  // The rides of the best and second-best hour, by index: a library's windows go through this for every week.
  let best = -1
  let second = -1
  const value = (i: number) => rides[i]!.hour!.value
  for (let i = lo; i < hi; i++) {
    const effort = rides[i]!.hour
    if (effort === null) continue
    if (best < 0 || effort.value > value(best)) {
      second = best
      best = i
    } else if (second < 0 || effort.value > value(second)) second = i
  }
  if (best < 0) return null
  const hourOfRide = (i: number): Hour => ({ activityId: rides[i]!.activityId, ...rides[i]!.hour! })
  if (second >= 0 && value(second) >= value(best) * (1 - HOUR_AGREEMENT)) return hourOfRide(best)
  if (value(best) <= fuse(mean, relativeError, null).high) return hourOfRide(best)
  return second < 0 ? null : hourOfRide(second)
}

/** The power estimate of a flat list of efforts, each with its age. */
export function powerEstimate(
  efforts: readonly ThresholdEffort[],
  table: DurationTable = DURATION_TABLES.ride,
): PowerEstimate | null {
  const { rides, ages } = prepareFlat(efforts, [], table)
  return powerOver(rides, ages)
}
