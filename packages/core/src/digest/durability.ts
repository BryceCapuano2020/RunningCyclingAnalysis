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
 * are scored as that curve scores them, over elapsed seconds with a pause counting as rest. As in
 * the main curve a longer window also holds for a shorter duration, so a duration takes the better of
 * its own best and the longer one's. A point the activity cannot support, or whose best is zero, is left out.
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
    const windows = meanMaximal(values, valid, DURABILITY_DURATIONS_S, activityId, start)
    let best = NaN
    // From the longest duration down, so a shorter one can take the longer one's value.
    for (let k = windows.length - 1; k >= 0; k--) {
      const value = windows[k]!.value
      if (!Number.isNaN(value) && (Number.isNaN(best) || value > best)) best = value
      if (best > 0) points.push({ afterS, durationS: windows[k]!.durationS, value: best })
    }
  }
  return points.sort((a, b) => a.afterS - b.afterS || a.durationS - b.durationS)
}
