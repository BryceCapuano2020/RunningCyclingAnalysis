import {
  CLIMB_BPM,
  CLIMB_FADE_BPM,
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
import { EDGE_EPSILON } from '../math'
import { median, medianElementInPlace, standardDeviation } from './stats'
import type { HeartRateRefusal, ThresholdBlock } from './types'

export interface HeartRateLine {
  /** Beats per minute gained per unit of value. */
  slope: number
  /** The pooled heart rate at zero value of the rides it was fitted over: the median of their own offsets. */
  offset: number
  /** Each ride's own offset, for the rides with blocks. */
  offsets: ReadonlyMap<string, number>
  /** Rides whose heart rate cannot be trusted: stuck, or sitting far from the pooled offset. */
  excluded: ReadonlySet<string>
  /** The typical distance of a block from its own ride's line, in bpm. */
  spread: number
  /** The highest block heart rate among the rides kept. */
  highest: number
  /** The highest block heart rate of each ride kept, so a window finds its own highest. */
  rideHighest: ReadonlyMap<string, number>
}

type LineRefusal = Extract<HeartRateRefusal, 'few-blocks' | 'stuck' | 'flat' | 'steep'>

/** The value that gives `heartRate` on the line: on the ride's own offset where it has one, else the pooled one. */
export function valueAt(line: HeartRateLine, heartRate: number, activityId?: string): number {
  return (heartRate - (line.offsets.get(activityId ?? '') ?? line.offset)) / line.slope
}

/**
 * Theil-Sen slope of y on x: the median of the slopes of all pairs. The caller has thinned the points to a few hundred. The
 * slopes go in one typed array, which sorts without a comparator: sorting the 45,000 of a full window with one was most of the call.
 */
function theilSen(xs: readonly number[], ys: readonly number[]): number | null {
  const slopes = new Float64Array((xs.length * (xs.length - 1)) / 2)
  let count = 0
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      const dx = xs[j]! - xs[i]!
      if (Math.abs(dx) > EDGE_EPSILON) slopes[count++] = (ys[j]! - ys[i]!) / dx
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
 * Whether the line climbs a believable amount from half of `power` to all of it: slope * half the power, in bpm whatever the
 * unit. Under 20 bpm it is `flat`, over 70 `steep`: no working strap does that. Null where it does. Asked of each window
 * with its own power estimate, since the same slope is a different climb at a different power.
 */
export function climbRefusal(slope: number, power: number): 'flat' | 'steep' | null {
  const climb = slope * 0.5 * power
  if (!(climb >= CLIMB_BPM[0])) return 'flat'
  return climb > CLIMB_BPM[1] ? 'steep' : null
}

/**
 * How much heart rate counts at this climb, 0 to 1: 0 at the flat floor, rising on a smoothstep to 1 at CLIMB_FADE_BPM above it,
 * so the answer moves smoothly as a ride nudges the climb across the floor. Asked of each window with its own power estimate.
 */
export function climbWeight(slope: number, power: number): number {
  const t = (slope * 0.5 * power - CLIMB_BPM[0]) / CLIMB_FADE_BPM
  if (!(t > 0)) return 0
  return t >= 1 ? 1 : t * t * (3 - 2 * t)
}

/**
 * The rider's own heart rate against value, from 5 min blocks between 45% and 105% of the power estimate. Heart rate is
 * regressed on value, not the other way: heart rate is the noisy reading, and fitting value on heart rate flattens the
 * slope. The slope comes from changes within each ride (same strap, same day), so day-to-day offsets from heat, fatigue or
 * sensor placement do not flatten it. A ride that is stuck, or whose level sits more than 10 bpm off the pooled one, is
 * named and left out. Fitted once over all the power-meter rides of a library, and read by every window of it (the climb is
 * asked of each, `climbRefusal`). `power` sets the band of blocks that count: the library's power estimate.
 */
export function lineOf(
  blocks: readonly ThresholdBlock[],
  power: number,
): HeartRateLine | { refused: Extract<LineRefusal, 'few-blocks' | 'stuck' | 'flat'> } {
  const byRide = new Map<string, ThresholdBlock[]>()
  for (const b of blocks) {
    const inBand = b.value >= LINE_POWER_BAND[0] * power && b.value <= LINE_POWER_BAND[1] * power
    if (!inBand || !Number.isFinite(b.heartRate)) continue
    const own = byRide.get(b.activityId)
    if (own === undefined) byRide.set(b.activityId, [b])
    else own.push(b)
  }
  const stuck = new Set<string>()
  for (const [id, rideBlocks] of byRide) if (isStuck(rideBlocks)) stuck.add(id)
  // A slope within a ride needs three of its blocks.
  const slopeRides = [...byRide].filter(([, rideBlocks]) => rideBlocks.length >= 3)
  const usable = slopeRides.filter(([id]) => !stuck.has(id))
  const total = usable.reduce((sum, [, rideBlocks]) => sum + rideBlocks.length, 0)
  if (total < LINE_MIN_BLOCKS) {
    const before = slopeRides.reduce((sum, [, rideBlocks]) => sum + rideBlocks.length, 0)
    return { refused: before >= LINE_MIN_BLOCKS ? 'stuck' : 'few-blocks' }
  }
  // The points are each block's change from its ride's mean, thinned to every stride-th so the pairs stay a few tens of thousands.
  const stride = Math.ceil(total / THEIL_SEN_POINTS)
  const xs: number[] = []
  const ys: number[] = []
  let at = 0
  for (const [, rideBlocks] of usable) {
    let heartRate = 0
    let value = 0
    for (const b of rideBlocks) {
      heartRate += b.heartRate
      value += b.value
    }
    heartRate /= rideBlocks.length
    value /= rideBlocks.length
    for (const b of rideBlocks) {
      if (at++ % stride === 0) {
        xs.push(b.value - value)
        ys.push(b.heartRate - heartRate)
      }
    }
  }
  const slope = theilSen(xs, ys)
  // No slope to read means power never moved within a ride: heart rate has nothing to follow.
  if (slope === null) return { refused: 'flat' }

  const offsets = new Map<string, number>()
  for (const [id, rideBlocks] of byRide) {
    if (stuck.has(id)) continue
    const lows = new Float64Array(rideBlocks.length)
    rideBlocks.forEach((b, i) => (lows[i] = b.heartRate - slope * b.value))
    offsets.set(id, medianElementInPlace(lows))
  }
  const offset = median([...offsets.values()])
  const excluded = new Set(stuck)
  for (const [id, own] of offsets) if (Math.abs(own - offset) > OFFSET_LIMIT_BPM) excluded.add(id)

  const residuals: number[] = []
  const rideHighest = new Map<string, number>()
  let highest = -Infinity
  for (const [id, rideBlocks] of byRide) {
    if (excluded.has(id)) continue
    const own = offsets.get(id)!
    let top = -Infinity
    for (const b of rideBlocks) {
      residuals.push(Math.abs(b.heartRate - (own + slope * b.value)))
      top = Math.max(top, b.heartRate)
    }
    rideHighest.set(id, top)
    highest = Math.max(highest, top)
  }
  return {
    slope,
    offset,
    offsets,
    excluded,
    spread: MAD_TO_SD * median(residuals),
    highest,
    rideHighest,
  }
}

/** `lineOf` with the climb asked of the same `power`: the line of a single window, which is the whole set. */
export function fitHeartRateLine(
  blocks: readonly ThresholdBlock[],
  power: number,
): HeartRateLine | { refused: LineRefusal } {
  const line = lineOf(blocks, power)
  if ('refused' in line) return line
  const refused = climbRefusal(line.slope, power)
  return refused === null ? line : { refused }
}
