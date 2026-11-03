import {
  ESTIMATED_WEIGHT,
  HALF_LIFE_DAYS,
  NEAR_TOP_CENTRE,
  NEAR_TOP_WIDTH,
  POWER_MIN_ERROR,
} from './constants'
import { DURATION_TABLES } from './durationTables'
import type { DurationTable } from './durationTables'
import { robustMeanOf } from './robustMean'
import { prepareFlat } from './rides'
import type { HourEffort, PreparedRide } from './rides'
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
  /** The mean of the rides' estimates, or the best hour in the window where that is higher (see `floor`). */
  value: number
  /** The relative error, never under POWER_MIN_ERROR. */
  relativeError: number
  rides: number
  /** The ride with the highest estimate among those the mean kept; the ride of the best hour where the hour is what sets `value`. */
  strongest: { activityId: string; durationS: number; estimated: boolean }
  /**
   * The best effort of an hour or longer in the window, or 0 without one. An hour the athlete did is a floor under the
   * answer, whatever the mean of the rides' estimates says: the answer and its low are never under it.
   */
  floor: number
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
 * (days back from the newest activity of the set, never under 0). Null where no ride has an effort of 3 min or more, or none
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
  const hour = bestHour(rides, lo, hi)
  // An hour the athlete did is a floor under the mean, and then the effort that sets the value, so it is the one named.
  if (hour !== null && hour.effort.value > mean.value) {
    const { value, durationS: held, estimated: guessed } = hour.effort
    return {
      value,
      relativeError,
      rides: at.length,
      strongest: { activityId: hour.activityId, durationS: held, estimated: guessed },
      floor: value,
    }
  }
  return {
    value: mean.value,
    relativeError,
    rides: at.length,
    strongest: { activityId: rides[at[strongest]!]!.activityId, durationS, estimated },
    floor: hour?.effort.value ?? 0,
  }
}

/** The best effort of an hour or longer among the rides from `lo` up to, not including, `hi`, and the ride that held it. */
function bestHour(
  rides: readonly PreparedRide[],
  lo: number,
  hi: number,
): { activityId: string; effort: HourEffort } | null {
  let found: { activityId: string; effort: HourEffort } | null = null
  for (let i = lo; i < hi; i++) {
    const effort = rides[i]!.hour
    if (effort !== null && (found === null || effort.value > found.effort.value)) {
      found = { activityId: rides[i]!.activityId, effort }
    }
  }
  return found
}

/** The power estimate of a flat list of efforts, each with its age. */
export function powerEstimate(
  efforts: readonly ThresholdEffort[],
  table: DurationTable = DURATION_TABLES.ride,
): PowerEstimate | null {
  const { rides, ages } = prepareFlat(efforts, [], table)
  return powerOver(rides, ages)
}
