import {
  CLIMB_BPM,
  LINE_MIN_BLOCKS,
  LINE_POWER_BAND,
  MAD_TO_SD,
  OFFSET_LIMIT_BPM,
  STUCK_MIN_BLOCKS,
  STUCK_POWER_CV,
  STUCK_SD_BPM,
  THEIL_SEN_MIN_SLOPES,
  THEIL_SEN_POINTS,
} from './constants'
import { EDGE_EPSILON, mean } from '../math'
import { median, medianElementInPlace, standardDeviation } from './stats'
import type { HeartRateRefusal, ThresholdBlock } from './types'

export interface HeartRateLine {
  /** Beats per minute gained per unit of value. */
  slope: number
  /** The pooled heart rate at zero value: the median of the rides' own offsets. */
  offset: number
  /** Each ride's own offset, for the rides with blocks. */
  offsets: ReadonlyMap<string, number>
  /** Rides whose heart rate cannot be trusted: stuck, or sitting far from the pooled offset. */
  excluded: ReadonlySet<string>
  /** The typical distance of a block from its own ride's line, in bpm. */
  spread: number
  /** The highest block heart rate among the rides kept. */
  highest: number
}

type LineRefusal = Extract<HeartRateRefusal, 'few-blocks' | 'stuck' | 'flat' | 'steep'>

/** The value that gives `heartRate` on the line: on the ride's own offset where it has one, else the pooled one. */
export function valueAt(line: HeartRateLine, heartRate: number, activityId?: string): number {
  return (heartRate - (line.offsets.get(activityId ?? '') ?? line.offset)) / line.slope
}

/**
 * Theil-Sen slope of y on x: the median of the slopes of all pairs, thinned to a few hundred points first. The slopes go in
 * one typed array, which sorts without a comparator: sorting the 45,000 of a full window with one was most of the call.
 */
function theilSen(points: readonly { x: number; y: number }[]): number | null {
  const stride = Math.ceil(points.length / THEIL_SEN_POINTS)
  const thinned = points.filter((_, i) => i % stride === 0)
  const slopes = new Float64Array((thinned.length * (thinned.length - 1)) / 2)
  let count = 0
  for (let i = 0; i < thinned.length; i++) {
    for (let j = i + 1; j < thinned.length; j++) {
      const dx = thinned[j]!.x - thinned[i]!.x
      if (Math.abs(dx) > EDGE_EPSILON) slopes[count++] = (thinned[j]!.y - thinned[i]!.y) / dx
    }
  }
  return count < THEIL_SEN_MIN_SLOPES ? null : medianElementInPlace(slopes.subarray(0, count))
}

/** A ride whose heart rate hardly moves while its power does: a stuck sensor, or one locked to cadence. */
function isStuck(blocks: readonly ThresholdBlock[]): boolean {
  if (blocks.length < STUCK_MIN_BLOCKS) return false
  const values = blocks.map((b) => b.value)
  return (
    standardDeviation(blocks.map((b) => b.heartRate)) < STUCK_SD_BPM &&
    standardDeviation(values) / median(values) > STUCK_POWER_CV
  )
}

/**
 * The rider's own heart rate against value, from 5 min blocks between 45% and 105% of the power estimate. Heart rate is
 * regressed on value, not the other way: heart rate is the noisy reading, and fitting value on heart rate flattens the
 * slope. The slope comes from changes within each ride (same strap, same day), so day-to-day offsets from heat, fatigue or
 * sensor placement do not flatten it. A ride that is stuck, or whose level sits more than 10 bpm off the pooled one, is
 * named and left out. The line is refused when heart rate climbs under 20 or over 70 bpm from half of the power estimate
 * to all of it: no working strap does that. The climb is slope * half the power estimate, in bpm whatever the unit.
 */
export function fitHeartRateLine(
  blocks: readonly ThresholdBlock[],
  power: number,
): HeartRateLine | { refused: LineRefusal } {
  const byRide = new Map<string, ThresholdBlock[]>()
  for (const b of blocks) {
    const inBand = b.value >= LINE_POWER_BAND[0] * power && b.value <= LINE_POWER_BAND[1] * power
    if (inBand && Number.isFinite(b.heartRate)) {
      byRide.set(b.activityId, [...(byRide.get(b.activityId) ?? []), b])
    }
  }
  const stuck = new Set(
    [...byRide].filter(([, rideBlocks]) => isStuck(rideBlocks)).map(([id]) => id),
  )
  // A slope within a ride needs three of its blocks.
  const slopeRides = [...byRide].filter(([, rideBlocks]) => rideBlocks.length >= 3)
  const points = slopeRides
    .filter(([id]) => !stuck.has(id))
    .flatMap(([, rideBlocks]) => {
      const heartRate = mean(rideBlocks.map((b) => b.heartRate))
      const value = mean(rideBlocks.map((b) => b.value))
      return rideBlocks.map((b) => ({ x: b.value - value, y: b.heartRate - heartRate }))
    })
  if (points.length < LINE_MIN_BLOCKS) {
    const before = slopeRides.reduce((total, [, rideBlocks]) => total + rideBlocks.length, 0)
    return { refused: before >= LINE_MIN_BLOCKS ? 'stuck' : 'few-blocks' }
  }
  const slope = theilSen(points)
  // No slope to read means power never moved within a ride: heart rate has nothing to follow.
  const climb = slope === null ? 0 : slope * 0.5 * power
  if (slope === null || !(climb >= CLIMB_BPM[0])) return { refused: 'flat' }
  if (climb > CLIMB_BPM[1]) return { refused: 'steep' }

  const offsets = new Map<string, number>()
  for (const [id, rideBlocks] of byRide) {
    if (!stuck.has(id))
      offsets.set(id, median(rideBlocks.map((b) => b.heartRate - slope * b.value)))
  }
  const offset = median([...offsets.values()])
  const excluded = new Set(stuck)
  for (const [id, own] of offsets) if (Math.abs(own - offset) > OFFSET_LIMIT_BPM) excluded.add(id)

  const kept = [...byRide]
    .filter(([id]) => !excluded.has(id))
    .flatMap(([id, rideBlocks]) => rideBlocks.map((b) => ({ ...b, own: offsets.get(id)! })))
  const residuals = kept.map((b) => Math.abs(b.heartRate - (b.own + slope * b.value)))
  return {
    slope,
    offset,
    offsets,
    excluded,
    spread: MAD_TO_SD * median(residuals),
    highest: kept.reduce((top, b) => Math.max(top, b.heartRate), -Infinity),
  }
}
