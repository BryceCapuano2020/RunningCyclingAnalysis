import {
  ESTIMATED_WEIGHT,
  HALF_LIFE_DAYS,
  NEAR_TOP_CENTRE,
  NEAR_TOP_WIDTH,
  POWER_MIN_ERROR,
} from './constants'
import { ratioSpread } from './durationRatio'
import { robustMeanOf } from './robustMean'
import { prepareFlat } from './rides'
import type { PreparedRide } from './rides'
import type { ThresholdEffort } from './types'

/** A ride's strongest effort, scaled to the threshold it implies. */
export interface RideEstimate {
  activityId: string
  durationS: number
  /** The threshold this effort implies: its value over the duration ratio. */
  value: number
  ageDays: number
  estimated: boolean
}

export interface PowerEstimate {
  value: number
  /** The relative error, never under POWER_MIN_ERROR. */
  relativeError: number
  rides: number
  strongest: { activityId: string; durationS: number; estimated: boolean }
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x))

/** The rides' strongest scaled efforts, each aged as the ride is. */
export function rideEstimates(efforts: readonly ThresholdEffort[]): RideEstimate[] {
  const { rides, ages } = prepareFlat(efforts, [])
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
  return weightOf(ride.value, ratioSpread(ride.durationS) ** 2, ride.estimated, ride.ageDays, top)
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
  return {
    value: mean.value,
    relativeError: Math.max(mean.relativeError, POWER_MIN_ERROR),
    rides: at.length,
    strongest: { activityId: rides[at[strongest]!]!.activityId, durationS, estimated },
  }
}

/** The power estimate of a flat list of efforts, each with its age. */
export function powerEstimate(efforts: readonly ThresholdEffort[]): PowerEstimate | null {
  const { rides, ages } = prepareFlat(efforts, [])
  return powerOver(rides, ages)
}
