import {
  ESTIMATED_WEIGHT,
  HALF_LIFE_DAYS,
  NEAR_TOP_CENTRE,
  NEAR_TOP_WIDTH,
  POWER_MIN_ERROR,
  SHORTEST_EFFORT_S,
} from './constants'
import { durationRatio, ratioSpread } from './durationRatio'
import { robustMean } from './robustMean'
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

/** Each ride's highest scaled effort; efforts under 3 min and values that are not positive and finite are ignored. */
export function rideEstimates(efforts: readonly ThresholdEffort[]): RideEstimate[] {
  const byRide = new Map<string, RideEstimate>()
  for (const e of efforts) {
    if (!(e.durationS >= SHORTEST_EFFORT_S) || !(e.value > 0) || !Number.isFinite(e.value)) continue
    const value = e.value / durationRatio(e.durationS)
    const best = byRide.get(e.activityId)
    if (best === undefined || value > best.value) {
      byRide.set(e.activityId, {
        activityId: e.activityId,
        durationS: e.durationS,
        value,
        ageDays: Math.max(0, e.ageDays),
        estimated: e.estimated,
      })
    }
  }
  return [...byRide.values()]
}

/**
 * How much a ride's estimate counts: its recency, whether it sits near the top, whether the watts were measured, over the
 * variance of its duration ratio. `top` is the second-strongest ride's estimate (the strongest when there is one ride), so
 * a single odd file cannot set the bar the others are judged by.
 */
export function rideWeight(ride: RideEstimate, top: number): number {
  const recency = 0.5 ** (ride.ageDays / HALF_LIFE_DAYS)
  const nearTop = logistic((ride.value / top - NEAR_TOP_CENTRE) / NEAR_TOP_WIDTH)
  const measured = ride.estimated ? ESTIMATED_WEIGHT : 1
  return (recency * nearTop * measured) / ratioSpread(ride.durationS) ** 2
}

/** The robust weighted mean of the rides' estimates, or null where no ride has an effort of 3 min or more. */
export function powerEstimate(efforts: readonly ThresholdEffort[]): PowerEstimate | null {
  const rides = rideEstimates(efforts)
  if (rides.length === 0) return null
  const sorted = rides.map((r) => r.value).sort((a, b) => b - a)
  const top = sorted[Math.min(1, sorted.length - 1)]!
  const mean = robustMean(rides.map((r) => ({ value: r.value, weight: rideWeight(r, top) })))
  if (mean === null) return null
  const kept = rides.filter((_, i) => mean.weights[i]! > 0)
  const { activityId, durationS, estimated } = kept.reduce((a, b) => (b.value > a.value ? b : a))
  return {
    value: mean.value,
    relativeError: Math.max(mean.relativeError, POWER_MIN_ERROR),
    rides: rides.length,
    strongest: { activityId, durationS, estimated },
  }
}
