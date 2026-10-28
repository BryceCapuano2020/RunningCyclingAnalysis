import { MAX_KM_SPLITS, MAX_MILE_SPLITS } from '../constants'
import { elevationIncrements } from '../digest/elevationGain'
import { metabolicToFlatSpeed } from '../metabolic'
import { QUALITY_THRESHOLDS } from '../quality'
import type { Activity, DigestSplit, DigestSplits, QualityReport } from '../types'
import { METRES_PER_KM, METRES_PER_MILE } from '../units/convert'

/** A partial remainder shorter than this is not reported, m. */
const MIN_PARTIAL_M = 100
/** Absorbs rounding, so a run that ends exactly on a whole unit has no partial split. */
const UNIT_EPSILON = 1e-9

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
 * Whether a split's time can be trusted. A split whose boundary falls in a gap cannot, and neither
 * can one whose distance implies a speed no run reaches. A split that merely contains a gap is
 * still right in wall-clock time, because its boundaries lie on the distance either side of it.
 */
function timeKnown(s: Streams, from: number, to: number, distanceM: number): boolean {
  if (boundaryInGap(s, from) || boundaryInGap(s, to)) return false
  return distanceM / (to - from) <= QUALITY_THRESHOLDS.speedSpike.maxSpeedMs.run
}

/**
 * Seconds on flat ground at the same metabolic cost as the split, from the mean cost of its moving
 * and stopped samples, as the best efforts pace is. Null when any moving sample has no known grade.
 * A recording gap inside the split is left out of the mean, which takes its time at the cost of the
 * rest of the split. That is the assumption, and for a steady pace it gives the wall-clock time.
 */
function flatSeconds(s: Streams, from: number, to: number, distanceM: number): number | null {
  const [first, end] = sampleRange(from, to, s.activity.n)
  let weight = 0
  let cost = 0
  for (let i = first; i < end; i++) {
    const w = overlap(i, from, to)
    // A gap the device did not record has no effort to count, so it takes the rest of the split's.
    if (w <= 0 || s.quality.validMotion[i] !== 1 || unrecordedAt(s.activity, i)) continue
    if (s.quality.validGrade[i] !== 1) return null
    weight += w
    cost += w * s.metabolic[i]!
  }
  if (!(weight > 0)) return null
  const flatSpeed = metabolicToFlatSpeed(cost / weight, s.economyScale)
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
  const known = timeKnown(s, from, to, distanceM)
  const flat = known ? flatSeconds(s, from, to, distanceM) : null
  // The clock time goes by the file's distance, but the cost behind the flat time goes by the lower
  // of its speed and distance streams. Where the speed was the lower one, the same distance read at
  // that slower cost gives a flat time longer than the clock, which only the disagreement explains.
  // A split touching one reads no slower than its clock. Uphill the flat time is already faster,
  // so the cap acts on flat and downhill splits, where a mild downhill's true slowing is lost.
  const capped =
    flat !== null && touchesDisagreement(s, from, to) ? Math.min(flat, to - from) : flat
  return {
    distanceM,
    seconds: known ? roundTo(to - from, 2) : null,
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
  const whole = Math.floor(totalM / unit + UNIT_EPSILON)
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
 * file's speed and distance disagreed. A unit with more splits than its limit has none.
 */
export function runSplits(
  activity: Activity,
  quality: QualityReport,
  metabolic: Float64Array,
  economyScale: number,
  covered: Uint8Array,
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
  const streams: Streams = { activity, quality, metabolic, economyScale, covered, climbTenths }
  return {
    km: splitsOf(streams, totalM, METRES_PER_KM, MAX_KM_SPLITS),
    mile: splitsOf(streams, totalM, METRES_PER_MILE, MAX_MILE_SPLITS),
  }
}
