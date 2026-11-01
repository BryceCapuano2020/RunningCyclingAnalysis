import {
  DISTANCE_BEST_TOLERANCE,
  RUN_RECORD_DISTANCES_M,
  RUN_WORLD_RECORD_SPEEDS,
} from '../constants'
import { interpolatedCeiling } from '../curves/speedCeiling'
import { QUALITY_THRESHOLDS } from '../quality'
import type { RunRecordDistanceM } from '../constants'
import type { DigestDistanceBest } from '../types'

/**
 * The most a run can cover in one 1 Hz sample: the top run speed, in metres. A larger step is a
 * distance jump, such as a recording gap the device did not time, not running.
 */
const MAX_STEP_M = QUALITY_THRESHOLDS.speedSpike.maxSpeedMs.run

/** An inclusive run of sample indices with no unusable sample inside it. */
interface Stretch {
  lo: number
  hi: number
}

/**
 * Stretches of consecutive valid samples with a finite distance. A stretch is cut wherever the
 * distance steps by more than MAX_STEP_M in one sample, so no window can contain such a step. That
 * also bounds every window's average speed by MAX_STEP_M.
 */
function validStretches(distance: Float64Array, valid: Uint8Array): Stretch[] {
  const stretches: Stretch[] = []
  let lo = -1
  for (let i = 0; i <= distance.length; i++) {
    const usable = i < distance.length && valid[i] === 1 && Number.isFinite(distance[i]!)
    const jump = usable && lo >= 0 && distance[i]! - distance[i - 1]! > MAX_STEP_M
    if (lo >= 0 && (!usable || jump)) {
      stretches.push({ lo, hi: i - 1 })
      lo = -1
    }
    if (usable && lo < 0) lo = i
  }
  return stretches
}

/**
 * Fastest elapsed time to cover `span` metres inside one stretch, or Infinity when none fits. A window
 * is continuous: its start and end may fall between samples. The optimum
 * lies at a window whose start or end is a whole sample, so two sweeps cover every case. The first
 * fixes the start sample and interpolates the end. The second fixes the end sample and interpolates
 * the start, taking the last moment the distance was at that level, since a stop still counts.
 */
function fastestWithin(d: Float64Array, { lo, hi }: Stretch, span: number): number {
  let best = Infinity
  let end = lo
  for (let start = lo; start <= hi; start++) {
    const target = d[start]! + span
    if (d[hi]! < target) break
    // Targets rise with the start, so the first sample at or past each target never moves back.
    while (d[end]! < target) end++
    const e = end - 1 + (target - d[end - 1]!) / (d[end]! - d[end - 1]!)
    best = Math.min(best, e - start)
  }
  let start = lo
  for (let last = lo; last <= hi; last++) {
    const target = d[last]! - span
    if (d[lo]! > target) continue
    while (start + 1 <= hi && d[start + 1]! <= target) start++
    const s = start + (target - d[start]!) / (d[start + 1]! - d[start]!)
    best = Math.min(best, last - s)
  }
  return best
}

/** How far a stretch's distance reaches, m. */
function reachOf(distance: Float64Array, { lo, hi }: Stretch): number {
  return distance[hi]! - distance[lo]!
}

/** The least time for each record distance, which is worked out once. */
const leastSecondsOf = new Map<number, number>()

/**
 * The least time, s, in which `distanceM` can be run: the world-record pace at that distance. The
 * most a run covers in t seconds is the ceiling speed x t, which rises with t, so the least time is
 * where that reaches the distance. It searches the world-record table through interpolatedCeiling and
 * not runCeilingSpeed, because runCeilingSpeed remembers its first few durations and the search would
 * fill that memory with durations nothing else asks for. The two must stay equal.
 */
function leastSeconds(distanceM: number): number {
  const known = leastSecondsOf.get(distanceM)
  if (known !== undefined) return known
  let lo = 0
  let hi = 1e6
  for (let step = 0; step < 60; step++) {
    const mid = (lo + hi) / 2
    if (interpolatedCeiling(RUN_WORLD_RECORD_SPEEDS, mid) * mid >= distanceM) hi = mid
    else lo = mid
  }
  leastSecondsOf.set(distanceM, hi)
  return hi
}

/**
 * The fastest time over `target` metres in any stretch that covers it, or Infinity when none does. A
 * stretch whose fastest window is under `minSeconds` is not used for this distance: that window cannot
 * have been run, and the windows beside it share its fault, so the stretch's other times are not
 * trusted either. Other stretches still compete.
 */
function fastestOver(
  distance: Float64Array,
  stretches: Stretch[],
  target: number,
  minSeconds: number,
): number {
  let seconds = Infinity
  for (const stretch of stretches) {
    if (reachOf(distance, stretch) < target) continue
    const within = fastestWithin(distance, stretch, target)
    if (within >= minSeconds) seconds = Math.min(seconds, within)
  }
  return seconds
}

/**
 * The time over `target` metres from a stretch that falls short of it by no more than
 * DISTANCE_BEST_TOLERANCE, or Infinity when none does. The stretch is timed over its whole length and
 * the time scaled up to the target: a 9.92 km race is a 10 km race. The span is a hair under the reach
 * because a stretch that starts part-way along the stream can have a reach that, added to its first
 * distance, rounds to above its last. A stretch whose scaled time is under `minSeconds` is not used.
 */
function fastestNear(
  distance: Float64Array,
  stretches: Stretch[],
  target: number,
  minSeconds: number,
): number {
  let seconds = Infinity
  for (const stretch of stretches) {
    const reach = reachOf(distance, stretch)
    if (reach >= target * (1 - DISTANCE_BEST_TOLERANCE) && reach < target) {
      // A relative margin, not rounding absorption (EDGE_EPSILON is absolute): the span must be strictly
      // inside the reach.
      const span = reach * (1 - 1e-9)
      const scale = target / span
      const scaled = fastestWithin(distance, stretch, span) * scale
      if (scaled >= minSeconds) seconds = Math.min(seconds, scaled)
    }
  }
  return seconds
}

/**
 * The fastest elapsed time over each run record distance, from a cumulative distance stream on a
 * 1 Hz grid. Only stretches of consecutive valid samples are searched, so a window never crosses
 * an invalid sample or a distance jump. A distance the run does not cover, or that no valid window
 * covers, is left out; one it falls short of by under DISTANCE_BEST_TOLERANCE counts as covered.
 *
 * `recorded` is the file's own distance, which decides whether the run covers a distance: the
 * summary and the splits go by it. `distance` may be lower than it where the file's streams
 * disagree, and then it times the windows. When it falls short of a distance the file covers, no
 * window of it can time that distance, so the file's own distance does.
 */
export function distanceBests(
  distance: Float64Array,
  valid: Uint8Array,
  recorded: Float64Array = distance,
  distances: readonly RunRecordDistanceM[] = RUN_RECORD_DISTANCES_M,
): DigestDistanceBest[] {
  let total = 0
  for (const d of recorded) if (Number.isFinite(d) && d > total) total = d
  const stretches = validStretches(distance, valid)
  const recordedStretches = recorded === distance ? stretches : validStretches(recorded, valid)
  const bests: DigestDistanceBest[] = []
  for (const distanceM of distances) {
    if (total < distanceM * (1 - DISTANCE_BEST_TOLERANCE)) continue
    // A run that covers a distance keeps its exact time; the tolerance applies only when none does.
    // A stretch with a window faster than the world record is a recording fault and is not used.
    const least = leastSeconds(distanceM)
    let seconds = fastestOver(distance, stretches, distanceM, least)
    if (!Number.isFinite(seconds) && recorded !== distance) {
      seconds = fastestOver(recorded, recordedStretches, distanceM, least)
    }
    if (!Number.isFinite(seconds)) seconds = fastestNear(distance, stretches, distanceM, least)
    if (!Number.isFinite(seconds) && recorded !== distance) {
      seconds = fastestNear(recorded, recordedStretches, distanceM, least)
    }
    if (Number.isFinite(seconds)) bests.push({ distanceM, seconds })
  }
  return bests
}
