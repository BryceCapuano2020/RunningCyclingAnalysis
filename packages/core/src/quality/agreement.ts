import {
  AGREEMENT_MAX_RATIO,
  AGREEMENT_MIN_DIFFERENCE_M,
  AGREEMENT_MIN_MOVING_M,
  AGREEMENT_WINDOW_S,
} from '../constants'
import { travelledDistance } from '../metabolic/grade'
import type { Activity } from '../types'

/**
 * Where a file's speed and its recorded distance disagree, and the streams that credit only what
 * both support. A watch writes both, from different sources: its speed from GPS Doppler or a
 * footpod, its distance from the GPS track. Over most seconds they agree; on stairs, under trees or
 * between tall buildings one of them can read twice the other for half a minute. Which one is right
 * is not known, so over such a stretch each second takes the lower of the two. Files whose distance
 * comes from their speed, or their speed from their distance (GPX, and TCX or FIT with only one of
 * the two), agree by construction and are never touched. A TCX with both Speed and DistanceMeters
 * is compared like a FIT.
 */

export interface AgreedStreams {
  /** Speed, m/s, no faster in a disagreeing stretch than the recorded distance advances. */
  speed: Float64Array
  /** Cumulative distance, m, gaining no faster in a disagreeing stretch than the speed. */
  distance: Float64Array
  /** 1 for every second the lowering covers: the whole of every window where the streams disagree. */
  covered: Uint8Array
  /** The covered seconds, as [start, end) stretches. */
  stretches: { start: number; end: number }[]
}

/**
 * The speed and distance of an activity where, over every second of a window of AGREEMENT_WINDOW_S
 * in which they disagree, each second takes the lower of the two streams' rates; and the stretches
 * where they disagree. A window touching a paused, unrecorded or unknown-speed second is not
 * compared. With no disagreement the activity's own arrays are returned. The second right after
 * an unrecorded or unknown-speed stretch keeps its recorded gain, which holds the distance gained
 * across that stretch: the speed has no rate for it to be lowered to.
 */
export function agreedStreams(
  activity: Pick<Activity, 'n' | 'speed' | 'distance' | 'paused' | 'unrecorded'>,
): AgreedStreams {
  const { n, speed, distance, paused, unrecorded } = activity
  const half = Math.floor(AGREEMENT_WINDOW_S / 2)
  const travelled = travelledDistance(speed, distance)
  const skipped = new Int32Array(n + 1)
  for (let i = 0; i < n; i++) {
    const unknown = paused[i] === 1 || unrecorded?.[i] === 1 || Number.isNaN(speed[i]!)
    skipped[i + 1] = skipped[i]! + (unknown ? 1 : 0)
  }
  // 1 for every second inside a window where the streams disagree.
  const covered = new Uint8Array(n)
  for (let i = half; i + half < n; i++) {
    if (skipped[i + half + 1]! - skipped[i - half]! > 0) continue
    const bySpeed = travelled[i + half]! - travelled[i - half]!
    const recorded = distance[i + half]! - distance[i - half]!
    if (!disagree(bySpeed, recorded)) continue
    covered.fill(1, i - half, i + half + 1)
  }
  const stretches = coveredStretches(covered)
  if (stretches.length === 0) return { speed, distance, covered, stretches }
  // Across an unrecorded stretch the recorded distance is held and then steps, while the travelled
  // distance spreads that step over the stretch, so their gains at its far end are not one rate.
  const followsUnknown = (i: number) => unrecorded?.[i - 1] === 1 || Number.isNaN(speed[i - 1]!)
  const agreedSpeed = Float64Array.from(speed)
  const agreedDistance = Float64Array.from(distance)
  for (let i = 1; i < n; i++) {
    const gain = distance[i]! - distance[i - 1]!
    const lowered = covered[i] === 1 && !followsUnknown(i)
    const lower = lowered ? Math.min(gain, travelled[i]! - travelled[i - 1]!) : gain
    agreedDistance[i] = agreedDistance[i - 1]! + lower
  }
  for (let i = 0; i < n; i++) {
    if (covered[i] !== 1) continue
    // The recorded rate at a second is its centred gain, as a speed sample is centred on it.
    const lo = Math.max(0, i - 1)
    const hi = Math.min(n - 1, i + 1)
    const recordedRate = (distance[hi]! - distance[lo]!) / (hi - lo)
    agreedSpeed[i] = Math.min(speed[i]!, recordedRate)
  }
  return { speed: agreedSpeed, distance: agreedDistance, covered, stretches }
}

/** The maximal runs of 1 in a 0/1 mask, as [start, end) stretches. */
function coveredStretches(covered: Uint8Array): AgreedStreams['stretches'] {
  const stretches: AgreedStreams['stretches'] = []
  for (let i = 0; i < covered.length; i++) {
    if (covered[i] !== 1) continue
    const start = i
    while (i < covered.length && covered[i] === 1) i++
    stretches.push({ start, end: i })
  }
  return stretches
}

/** Whether two distances over one window, both of a moving athlete, disagree. */
function disagree(a: number, b: number): boolean {
  const low = Math.min(a, b)
  const high = Math.max(a, b)
  return (
    low >= AGREEMENT_MIN_MOVING_M &&
    high - low >= AGREEMENT_MIN_DIFFERENCE_M &&
    high > AGREEMENT_MAX_RATIO * low
  )
}
