import {
  GAP_SD_SHARE,
  HALF_LIFE_DAYS,
  HR_EFFORT_SHARE,
  LINE_GAP_SD_SHARE,
  LINE_SD,
  MIN_SPREAD_BPM,
  READING_SD_BPM,
  REFERENCE_ERROR,
  RESIDUAL_CAP_BPM,
} from './constants'
import { climbRefusal, climbWeight, fitHeartRateLine } from './heartRateLine'
import type { HeartRateLine } from './heartRateLine'
import { robustMeanOf } from './robustMean'
import { prepareFlat } from './rides'
import type { PreparedRide } from './rides'
import { median } from './stats'
import type { HeartRateRefusal, ThresholdBlock, ThresholdEffort } from './types'

export interface HeartRateEstimate {
  value: number
  /** Relative error, including the reference maximum's, which never averages away. */
  relativeError: number
  /** How many efforts it was built from. */
  efforts: number
  /** How much it counts in the answer, 0 to 1: under 1 where the line's climb is near the flat floor (`climbWeight`). */
  weight: number
}

/** The weight of an effort that sits `distance` bpm off its ride's line: 1 on it, 0 at the cap (4 spreads, at most 12 bpm). */
function lineQuality(distance: number, spread: number): number {
  const u = distance / Math.min(4 * Math.max(spread, MIN_SPREAD_BPM), RESIDUAL_CAP_BPM)
  return Math.abs(u) >= 1 ? 0 : (1 - u * u) ** 2
}

/**
 * What one ride's efforts say, read against its offset on the line and before its age: each effort slid along the line to
 * threshold heart rate (`value + (thresholdHr - hr) / slope`), its quality (how near its ride's own line it sat) and the
 * variance of its estimate. A weight is `quality * recency / variance`, and the recency is the window's to give.
 */
export interface RideHeart {
  values: Float64Array
  quality: Float64Array
  variance: Float64Array
}

const NO_HEART: RideHeart = {
  values: new Float64Array(0),
  quality: new Float64Array(0),
  variance: new Float64Array(0),
}

/**
 * Slides each steady effort of the ride along the rider's line to threshold heart rate. Only measured efforts of 8 to 30 min
 * count (shorter lags, longer drifts), at 85 to 102% of threshold heart rate and within 12 bpm of the ride's own line (the
 * cap, or four spreads where those are narrower). An effort far from threshold is trusted less, in proportion to the
 * distance it is extrapolated over.
 */
function rideHeart(
  ride: PreparedRide,
  line: HeartRateLine,
  thresholdHr: number,
  offset: number,
): RideHeart {
  const values: number[] = []
  const quality: number[] = []
  const variance: number[] = []
  eachEffort(ride, line, thresholdHr, offset, (value, q, v) => {
    values.push(value)
    quality.push(q)
    variance.push(v)
  })
  return values.length === 0
    ? NO_HEART
    : {
        values: Float64Array.from(values),
        quality: Float64Array.from(quality),
        variance: Float64Array.from(variance),
      }
}

/** The efforts of a ride that count, each as its value at threshold heart rate, its quality and its variance. */
function eachEffort(
  ride: PreparedRide,
  line: HeartRateLine,
  thresholdHr: number,
  offset: number,
  visit: (value: number, quality: number, variance: number) => void,
): void {
  for (const e of ride.heart) {
    const share = e.heartRate / thresholdHr
    if (!(share >= HR_EFFORT_SHARE[0] && share <= HR_EFFORT_SHARE[1])) continue
    const q = lineQuality(e.heartRate - (offset + line.slope * e.value), line.spread)
    if (q === 0) continue
    const gap = thresholdHr - e.heartRate
    const value = e.value + gap / line.slope
    const sd =
      Math.hypot(READING_SD_BPM / line.slope, (GAP_SD_SHARE * Math.abs(gap)) / line.slope) / value
    visit(value, q, sd ** 2)
  }
}

/**
 * The line and threshold heart rate a set of rides is read against, with what each ride that has an offset of its own on the
 * line says (`own`, parallel to `rides`; null for a ride that has none, or is left out). Worked out once for the set, so a
 * window of it costs the mean over the efforts it holds.
 */
export interface HeartBasis {
  line: HeartRateLine
  thresholdHr: number
  rides: readonly PreparedRide[]
  own: readonly (RideHeart | null)[]
  /** Each ride's offset on the line (NaN for a ride with none), its highest block (-Infinity) and whether it is left out. */
  offsets: Float64Array
  highests: Float64Array
  left: Uint8Array
}

export function heartBasis(
  rides: readonly PreparedRide[],
  line: HeartRateLine,
  thresholdHr: number,
): HeartBasis {
  const offsets = new Float64Array(rides.length).fill(Number.NaN)
  const highests = new Float64Array(rides.length).fill(-Infinity)
  const left = new Uint8Array(rides.length)
  const own = rides.map((ride, i) => {
    const id = ride.activityId
    const offset = line.offsets.get(id)
    if (offset !== undefined) offsets[i] = offset
    highests[i] = line.rideHighest.get(id) ?? -Infinity
    left[i] = line.excluded.has(id) ? 1 : 0
    if (offset === undefined || left[i] === 1) return null
    return rideHeart(ride, line, thresholdHr, offset)
  })
  return { line, thresholdHr, rides, own, offsets, highests, left }
}

/**
 * What a window takes from the library's line besides its slope and spread: the pooled offset, the median of its own rides'
 * offsets (the line's where none has one), and the highest block heart rate among its rides that were kept (the line's where
 * none was).
 */
export function windowFrame(
  basis: HeartBasis,
  lo: number,
  hi: number,
): { pooled: number; highest: number } {
  const { line, offsets: rideOffsets, highests } = basis
  const offsets = new Float64Array(hi - lo)
  let offered = 0
  let highest = -Infinity
  for (let i = lo; i < hi; i++) {
    if (!Number.isNaN(rideOffsets[i]!)) offsets[offered++] = rideOffsets[i]!
    if (highests[i]! > highest) highest = highests[i]!
  }
  return {
    pooled: offered === 0 ? line.offset : median(offsets.subarray(0, offered)),
    highest: highest === -Infinity ? line.highest : highest,
  }
}

/**
 * What heart rate says the threshold is over the rides from `lo` up to, not including, `hi`, each aged by `ages` (days):
 * `power` is the window's own power estimate, which the climb is asked of. The line was fitted over the whole set, so a
 * window reads its slope, its spread and its rides' offsets; the pooled offset is the median of its own rides' offsets, a ride
 * with none is read at that, and its highest block is the highest of its own rides'. Returns the first guard that stopped it
 * where it could not say.
 */
export function heartOver(
  basis: HeartBasis,
  ages: ArrayLike<number>,
  power: number,
  lo = 0,
  hi = basis.rides.length,
): HeartRateEstimate | { refused: HeartRateRefusal } {
  const { line, thresholdHr, rides, own, left } = basis
  const climb = climbRefusal(line.slope, power)
  if (climb !== null) return { refused: climb }
  const { pooled, highest } = windowFrame(basis, lo, hi)
  // Room for every effort of the window's rides, and the line's own value.
  let room = 1
  for (let i = lo; i < hi; i++) room += own[i]?.values.length ?? rides[i]!.heart.length
  const values = new Float64Array(room)
  const weights = new Float64Array(room)
  let used = 0
  for (let i = lo; i < hi; i++) {
    if (left[i] === 1) continue
    const recency = 0.5 ** (Math.max(0, ages[i]!) / HALF_LIFE_DAYS)
    const evidence = own[i]
    if (evidence === null || evidence === undefined) {
      // A ride with no offset of its own is read at the window's pooled one.
      eachEffort(rides[i]!, line, thresholdHr, pooled, (value, quality, variance) => {
        values[used] = value
        weights[used++] = (quality * recency) / variance
      })
    } else {
      for (let k = 0; k < evidence.values.length; k++) {
        values[used] = evidence.values[k]!
        weights[used++] = (evidence.quality[k]! * recency) / evidence.variance[k]!
      }
    }
  }
  if (used === 0) return { refused: 'no-efforts' }
  const efforts = used
  // The line's own value at threshold heart rate joins them, trusted less the further threshold heart rate lies above the
  // highest block.
  const atThreshold = (thresholdHr - pooled) / line.slope
  if (atThreshold > 0) {
    const gap = Math.max(0, thresholdHr - highest)
    const sd = Math.hypot(LINE_SD, (LINE_GAP_SD_SHARE * gap) / line.slope / atThreshold)
    values[used] = atThreshold
    weights[used++] = 1 / sd ** 2
  }
  const mean = robustMeanOf(values, weights, used)
  if (mean === null) return { refused: 'no-efforts' }
  return {
    value: mean.value,
    relativeError: Math.hypot(mean.relativeError, REFERENCE_ERROR),
    efforts,
    weight: climbWeight(line.slope, power),
  }
}

/**
 * What heart rate says the threshold is for a flat list of efforts and blocks read as one window: `power` is the power
 * estimate the line's block band is set from, `thresholdHr` the heart rate at threshold (the caller's 90% of the sport's
 * reference maximum).
 */
export function heartRateEstimate(
  efforts: readonly ThresholdEffort[],
  blocks: readonly ThresholdBlock[],
  thresholdHr: number | null,
  power: number,
): HeartRateEstimate | { refused: HeartRateRefusal } {
  if (thresholdHr === null || !(thresholdHr > 0) || blocks.length === 0) {
    return { refused: 'no-heart-rate' }
  }
  const line = fitHeartRateLine(blocks, power)
  if ('refused' in line) return line
  const { rides, ages } = prepareFlat(efforts, blocks)
  return heartOver(heartBasis(rides, line, thresholdHr), ages, power)
}
