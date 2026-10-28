import { DURABILITY_AFTER_S, DURABILITY_DURATIONS_S } from '../constants'
import { meanMaximal } from '../curves'
import type { DigestDurabilityPoint } from '../types'

/**
 * The first sample index at which at least afterS seconds of moving time have passed, or -1 when
 * none is left to start a window at.
 */
function startAfter(moving: Uint8Array, afterS: number): number {
  let seconds = 0
  for (let i = 0; i < moving.length; i++) {
    if (seconds >= afterS) return i
    seconds += moving[i]!
  }
  return -1
}

/**
 * Best output at each of DURABILITY_DURATIONS_S in windows that start after at least afterS seconds
 * of moving time, for each afterS in DURABILITY_AFTER_S: what the athlete can still do late in a long
 * effort. `values` and `valid` are the stream and mask of the activity's main curve, so the windows
 * are scored as that curve scores them, over elapsed seconds with a pause counting as rest. They are
 * not held to the main curve's rule that a window is at least BEST_WINDOW_MIN_MOVING_FRACTION moving:
 * the main curve leaves out a window that is more than a tenth paused, but a late stop is part of what
 * the athlete does late in a long effort, and the pause only lowers the value. A point the activity
 * cannot support, or whose best is zero, is left out.
 */
export function durabilityPoints(
  values: Float64Array,
  valid: Uint8Array,
  moving: Uint8Array,
  activityId: string,
): DigestDurabilityPoint[] {
  const points: DigestDurabilityPoint[] = []
  for (const afterS of DURABILITY_AFTER_S) {
    const start = startAfter(moving, afterS)
    if (start < 0) break
    const windows = meanMaximal(values, valid, DURABILITY_DURATIONS_S, activityId, {
      firstStart: start,
    })
    for (const window of windows) {
      // A zero best is not an effort. The main curve's envelope is not applied: a 300 s window inside
      // the best 1200 s window starts under the same rule and has a mean at least as high, so
      // the shorter duration's own best already is the better.
      if (window.value > 0)
        points.push({ afterS, durationS: window.durationS, value: window.value })
    }
  }
  return points.sort((a, b) => a.afterS - b.afterS || a.durationS - b.durationS)
}
