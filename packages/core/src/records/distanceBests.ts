import { RUN_RECORD_DISTANCES_M } from '../constants'
import { QUALITY_THRESHOLDS } from '../quality'
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
 * Fastest elapsed time to cover `span` metres inside one stretch, or Infinity when none fits.
 * A window is continuous: its start and end may fall between samples. The optimum lies at a
 * window whose start or end is a whole sample, so two sweeps cover every case. The first fixes the
 * start sample and interpolates the end. The second fixes the end sample and interpolates the
 * start, taking the last moment the distance was at that level, since a stop still counts.
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

/** The fastest time over `span` metres in any stretch of `distance`, or Infinity when none fits. */
function fastestOver(distance: Float64Array, stretches: Stretch[], span: number): number {
  let seconds = Infinity
  for (const stretch of stretches) {
    seconds = Math.min(seconds, fastestWithin(distance, stretch, span))
  }
  return seconds
}

/**
 * The fastest elapsed time over each run record distance, from a cumulative distance stream on a
 * 1 Hz grid. Only stretches of consecutive valid samples are searched, so a window never crosses
 * an invalid sample or a distance jump. A distance the run does not cover, or that no valid window
 * covers, is left out.
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
): DigestDistanceBest[] {
  let total = 0
  for (const d of recorded) if (Number.isFinite(d) && d > total) total = d
  const stretches = validStretches(distance, valid)
  const recordedStretches = recorded === distance ? stretches : validStretches(recorded, valid)
  const bests: DigestDistanceBest[] = []
  for (const distanceM of RUN_RECORD_DISTANCES_M) {
    if (total < distanceM) continue
    let seconds = fastestOver(distance, stretches, distanceM)
    if (!Number.isFinite(seconds) && recorded !== distance) {
      seconds = fastestOver(recorded, recordedStretches, distanceM)
    }
    if (Number.isFinite(seconds)) bests.push({ distanceM, seconds })
  }
  return bests
}
