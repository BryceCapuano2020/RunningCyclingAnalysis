import { MAX_KM_SPLITS, MAX_MILE_SPLITS } from '../constants'
import { EDGE_EPSILON } from '../math'
import { elevationIncrements } from '../digest/elevationGain'
import { RESTING_W_PER_KG } from '../constants'
import { metabolicToFlatSpeed } from '../metabolic'
import { QUALITY_THRESHOLDS } from '../quality'
import { restsOf } from './rests'
import type { Activity, DigestSplit, DigestSplits, QualityReport } from '../types'
import { METRES_PER_KM, METRES_PER_MILE } from '../units/convert'

/** A partial remainder shorter than this is not reported, m. */
const MIN_PARTIAL_M = 100

/** The per-sample inputs every split of one run is read from. */
interface Streams {
  activity: Activity
  quality: QualityReport
  /** Gross metabolic W/kg per sample, from the model the best efforts use. */
  metabolic: Float64Array
  /** The economy scale the metabolic stream was built with, so flat speeds convert back alike. */
  economyScale: number
  /** 1 for every second where the file's speed and distance disagreed and the metabolic stream was lowered. */
  covered: Uint8Array
  /**
   * The speed stream the metabolic stream was built on (after the stream-agreement filter), or absent below
   * revision 7. Present, a split's cost is corrected for the file's distance against it (see `streamRatio`).
   */
  speed?: Float64Array
  /** 1 for every second the device was timing the run: neither paused nor in a gap it did not record. */
  moving: Uint8Array
  /** 1 for every second of a rest: not timed, and the run stood still across it. */
  rest: Uint8Array
  /** Metres the run gained in each rest second, which are in a split's distance but not in its time. */
  restGain: Float64Array
  /**
   * Cumulative climb at each sample boundary, in tenths of a metre, rounded once at the total. A
   * split's climb is the difference of two entries, so the splits of a unit add up to the run's.
   */
  climbTenths: Float64Array
}

/** One split: the seconds it covers, its length, and the samples it owns, [first, end). */
interface Span {
  from: number
  to: number
  distanceM: number
  first: number
  end: number
}

/** The largest distance the run reaches. A dip at the end does not shorten the run. */
function maxDistance(distance: Float64Array): number {
  let max = 0
  for (const value of distance) if (value > max) max = value
  return max
}

/**
 * Elapsed seconds at which the cumulative distance first reaches each target, interpolated
 * between 1 Hz samples. Targets must ascend. A target that is never reached gives the last sample.
 */
function timesAt(distance: Float64Array, targets: number[]): number[] {
  const n = distance.length
  let j = 0
  return targets.map((target) => {
    while (j < n && distance[j]! < target) j++
    if (j === n) return n - 1
    if (j === 0) return 0
    const before = distance[j - 1]!
    return j - 1 + (target - before) / (distance[j]! - before)
  })
}

/** The sample indices, from and to, that cover the seconds [from, to). Samples are 1 Hz. */
function sampleRange(from: number, to: number, n: number): [number, number] {
  return [Math.floor(from), Math.min(n, Math.ceil(to))]
}

/** The seconds of sample i, which covers [i, i + 1), that fall inside [from, to). */
function overlap(i: number, from: number, to: number): number {
  return Math.min(i + 1, to) - Math.max(i, from)
}

function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

/** Whether the device did not record sample i: it lies inside a gap the resampler marked. */
function unrecordedAt(activity: Activity, i: number): boolean {
  return activity.unrecorded?.[i] === 1
}

/**
 * Whether a boundary time sits inside a recording gap. The distance is held through a gap and then
 * stepped, so the time interpolated across the step is wrong. The step lies between the samples
 * either side of the boundary, so the boundary is in a gap when either of them is unrecorded. A
 * boundary at the start of the run is never in a gap.
 */
function boundaryInGap(s: Streams, t: number): boolean {
  if (t <= 0) return false
  const upper = Math.min(s.activity.n - 1, Math.ceil(t))
  const lower = Math.max(0, upper - 1)
  return unrecordedAt(s.activity, upper) || unrecordedAt(s.activity, lower)
}

/**
 * The seconds of the split that are not rests, and the metres it gained in its rests. A walk through
 * a recovery is in the split's distance but not in its time, so the pace takes it out of the
 * distance too: see timedPace.
 */
function timedSeconds(s: Streams, from: number, to: number): { timedS: number; restM: number } {
  const [first, end] = sampleRange(from, to, s.activity.n)
  let timedS = to - from
  let restM = 0
  for (let i = first; i < end; i++) {
    if (s.rest[i] !== 1) continue
    const w = Math.max(0, overlap(i, from, to))
    timedS -= w
    restM += w * s.restGain[i]!
  }
  return { timedS, restM }
}

/**
 * The seconds the split's whole distance would take at the pace it was run in its timed seconds: the
 * timed seconds, scaled by the distance over the distance less what its rests gained. With no gain in
 * a rest this is the timed seconds. Null when the rests account for all of the distance.
 */
function timedPace(timedS: number, restM: number, distanceM: number): number | null {
  if (!(timedS > 0)) return null
  const run = distanceM - restM
  return run > 0 ? (timedS * distanceM) / run : null
}

/**
 * Whether a split's time can be trusted. A split whose boundary falls in a gap cannot, and neither
 * can one with no timed seconds or whose distance implies a speed no run reaches. The time is the
 * split's time less its rests, so a pause or a standing gap inside it does not slow its pace.
 */
function timeKnown(
  s: Streams,
  from: number,
  to: number,
  distanceM: number,
  seconds: number | null,
) {
  if (boundaryInGap(s, from) || boundaryInGap(s, to)) return false
  return seconds !== null && distanceM / seconds <= QUALITY_THRESHOLDS.speedSpike.maxSpeedMs.run
}

/** The range of file-distance to speed-stream ratios that is corrected; a watch's two streams differ by about 1%. */
const MIN_STREAM_RATIO = 0.95
const MAX_STREAM_RATIO = 1.08

/**
 * Seconds on flat ground at the same metabolic cost as the split, from the mean cost of its moving
 * samples, as the best efforts pace is. Null when any moving sample has no known grade. Seconds the
 * device was not timing, a pause or a recording gap, are left out of the mean, so the flat time is
 * the distance at the cost of the running done.
 *
 * The clock follows the file's distance but the cost follows its speed stream, and a device's two differ by
 * a ratio. With `correct` (revision 7, a split clear of any disagreement) the mean cost above rest is
 * multiplied by `rho`, the distance the file gained over the split's moving seconds over the metres its
 * speed stream implies, when `rho` is from 0.95 to 1.08. A flat kilometre then shows no credit for the ratio.
 */
function flatSeconds(
  s: Streams,
  from: number,
  to: number,
  distanceM: number,
  correct: boolean,
): number | null {
  const [first, end] = sampleRange(from, to, s.activity.n)
  const { distance } = s.activity
  let weight = 0
  let cost = 0
  let fileM = 0
  let speedM = 0
  let whole = true
  for (let i = first; i < end; i++) {
    const w = overlap(i, from, to)
    if (w <= 0 || s.moving[i] !== 1) continue
    // A moving second with no usable motion is in the split's distance but not in its cost.
    if (s.quality.validMotion[i] !== 1) {
      whole = false
      continue
    }
    if (s.quality.validGrade[i] !== 1) return null
    weight += w
    cost += w * s.metabolic[i]!
    if (i > 0) {
      fileM += w * (distance[i]! - distance[i - 1]!)
      speedM += w * (s.speed?.[i] ?? 0)
    }
  }
  if (!(weight > 0)) return null
  let mean = cost / weight
  const rho = correct && whole && speedM > 0 ? fileM / speedM : 1
  if (rho >= MIN_STREAM_RATIO && rho <= MAX_STREAM_RATIO) {
    mean = RESTING_W_PER_KG + (mean - RESTING_W_PER_KG) * rho
  }
  const flatSpeed = metabolicToFlatSpeed(mean, s.economyScale)
  return flatSpeed > 0 ? distanceM / flatSpeed : null
}

/** Whether any second of the split lies in a stretch where the file's streams disagreed. */
function touchesDisagreement(s: Streams, from: number, to: number): boolean {
  const [first, end] = sampleRange(from, to, s.activity.n)
  for (let i = first; i < end; i++) if (overlap(i, from, to) > 0 && s.covered[i] === 1) return true
  return false
}

/** Time-weighted mean heart rate over the valid samples of the split, or null without any. */
function meanHeartRate(s: Streams, from: number, to: number): number | null {
  const [first, end] = sampleRange(from, to, s.activity.n)
  let weight = 0
  let sum = 0
  for (let i = first; i < end; i++) {
    const w = overlap(i, from, to)
    if (w <= 0 || s.quality.validHeartRate[i] !== 1) continue
    weight += w
    sum += w * s.activity.heartRate[i]!
  }
  return weight > 0 ? roundTo(sum / weight, 1) : null
}

function splitOf(s: Streams, span: Span): DigestSplit {
  const { from, to, distanceM, first, end } = span
  const { timedS, restM } = timedSeconds(s, from, to)
  const paced = timedPace(timedS, restM, distanceM)
  const known = timeKnown(s, from, to, distanceM, paced)
  const touches = touchesDisagreement(s, from, to)
  const flat = known ? flatSeconds(s, from, to, distanceM, s.speed !== undefined && !touches) : null
  // The clock time goes by the file's distance, but the cost behind the flat time goes by the lower
  // of its speed and distance streams. Where the speed was the lower one, the same distance read at
  // that slower cost gives a flat time longer than the clock, which only the disagreement explains.
  // A split touching one reads no slower than its clock. Uphill the flat time is already faster,
  // so the cap acts on flat and downhill splits, where a mild downhill's true slowing is lost.
  const capped = flat !== null && touches ? Math.min(flat, paced!) : flat
  return {
    distanceM,
    seconds: known ? roundTo(paced!, 2) : null,
    gradeAdjustedSeconds: capped === null ? null : roundTo(capped, 2),
    elevationGainM: s.activity.hasAltitude
      ? (s.climbTenths[end]! - s.climbTenths[first]!) / 10
      : null,
    avgHeartRate: meanHeartRate(s, from, to),
  }
}

/**
 * The splits of one run at every whole `unit` metres, plus the partial remainder when it is at
 * least MIN_PARTIAL_M. A split owns the samples from its start to the next split's start, and the
 * last split owns the rest of the run, so every sample's climb is counted in exactly one split.
 */
function splitsOf(s: Streams, totalM: number, unit: number, limit: number): DigestSplit[] {
  const whole = Math.floor(totalM / unit + EDGE_EPSILON)
  const remainder = totalM - whole * unit
  const partial = remainder >= MIN_PARTIAL_M
  if (whole + (partial ? 1 : 0) > limit) return []
  const cuts = Array.from({ length: whole + 1 }, (_, k) => k * unit)
  if (partial) cuts.push(totalM)
  const times = timesAt(s.activity.distance, cuts)
  const n = s.activity.n
  const lastCut = cuts.length - 2
  return cuts.slice(0, -1).map((start, k) => {
    const from = times[k]!
    const to = times[k + 1]!
    return splitOf(s, {
      from,
      to,
      // Full splits are exactly one unit, so none is mistaken for a partial one by rounding.
      distanceM: k < whole ? unit : roundTo(totalM - start, 2),
      first: Math.ceil(from),
      // The last split also owns the samples after its end, where the distance stops rising, so
      // every sample's climb lands in exactly one split and the splits add up to the run's climb.
      end: k === lastCut ? n : Math.ceil(to),
    })
  })
}

/**
 * Splits of a run at every whole kilometre and mile. `metabolic` is the run's gross metabolic
 * W/kg per sample, the stream the best efforts are built from, so a split's flat time and its
 * best-effort pace agree. `covered` marks the seconds where that stream was lowered because the
 * file's speed and distance disagreed. `moving` marks the seconds the device was timing, which every
 * split's time and flat time are counted over. A unit with more splits than its limit has none.
 * `agreedSpeed` is the speed stream `metabolic` was built on: given (revision 7), each split's flat time is
 * corrected for the ratio of the file's distance to it.
 */
export function runSplits(
  activity: Activity,
  quality: QualityReport,
  metabolic: Float64Array,
  economyScale: number,
  covered: Uint8Array,
  moving: Uint8Array,
  agreedSpeed?: Float64Array,
): DigestSplits {
  const totalM = maxDistance(activity.distance)
  if (totalM < MIN_PARTIAL_M) return { km: [], mile: [] }
  const climb = elevationIncrements(activity.altitude, quality.validGrade)
  const climbTenths = new Float64Array(activity.n + 1)
  let running = 0
  for (let i = 0; i < activity.n; i++) {
    running += climb[i]!
    climbTenths[i + 1] = Math.round(running * 10)
  }
  const { rest, gain } = restsOf(activity.distance, moving)
  const streams: Streams = {
    activity,
    quality,
    metabolic,
    economyScale,
    covered,
    ...(agreedSpeed === undefined ? {} : { speed: agreedSpeed }),
    moving,
    rest,
    restGain: gain,
    climbTenths,
  }
  return {
    km: splitsOf(streams, totalM, METRES_PER_KM, MAX_KM_SPLITS),
    mile: splitsOf(streams, totalM, METRES_PER_MILE, MAX_MILE_SPLITS),
  }
}
