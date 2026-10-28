import { rollingMean } from '../math'

const SMOOTHING_WINDOW = 30
/** Half the span over which grade measures rise over run, in samples (seconds). */
export const GRADE_HALF_SPAN_S = 15
const HALF_SPAN = GRADE_HALF_SPAN_S
/** Total sample radius over which one altitude sample can influence smoothGrade. */
export const GRADE_SMOOTHING_MARGIN_S = Math.floor(SMOOTHING_WINDOW / 2) + HALF_SPAN
const MIN_SPAN_M = 5
const MAX_ABS_GRADE = 0.35

/**
 * Gradient (rise over run) at each sample. Altitude is smoothed with a rolling mean, then the
 * change across +/- 15 samples is divided by the distance over the same span. Where the grade is
 * unknown it is NaN: a span shorter than 5 m (a stopped rider), or a span touching a NaN. A single
 * altitude sample can influence grades within GRADE_SMOOTHING_MARGIN_S samples.
 */
export function smoothGrade(altitude: Float64Array, distance: Float64Array): Float64Array {
  const n = altitude.length
  const grade = new Float64Array(n).fill(NaN)
  if (altitude.every(Number.isNaN)) {
    return grade
  }

  const smooth = rollingMean(altitude, SMOOTHING_WINDOW)
  for (let i = 0; i < n; i++) {
    const hi = Math.min(n - 1, i + HALF_SPAN)
    const lo = Math.max(0, i - HALF_SPAN)
    const rise = smooth[hi]! - smooth[lo]!
    const run = distance[hi]! - distance[lo]!
    // The negated comparison also rejects a NaN run.
    if (Number.isNaN(rise) || !(run >= MIN_SPAN_M)) {
      continue
    }
    grade[i] = Math.min(MAX_ABS_GRADE, Math.max(-MAX_ABS_GRADE, rise / run))
  }
  return grade
}

/**
 * Cumulative metres the speed stream itself implies, one second per sample, by the trapezoid rule.
 * A grade over this distance times that speed is the climb rate the altitude records. A file's
 * recorded distance can disagree with its speed over a stretch, as on stairs, and a grade over the
 * recorded distance times the speed then credits climbing that never happened.
 *
 * A stretch of unknown (NaN) speed, such as a recording gap or a speed over the sport's limit, takes
 * the `recorded` distance gained across it, spread evenly over its seconds, or nothing without one.
 * Altitude is interpolated across such a gap, so its run then rises with its rise and no grade
 * beside or inside it is made steeper.
 */
export function travelledDistance(speed: Float64Array, recorded?: Float64Array): Float64Array {
  const n = speed.length
  const out = new Float64Array(n)
  let i = 1
  while (i < n) {
    const a = speed[i - 1]!
    const b = speed[i]!
    if (!Number.isNaN(b)) {
      // Only a first sample of unknown speed leaves `a` unknown here.
      out[i] =
        out[i - 1]! + (Number.isNaN(a) ? (recordedGain(recorded, i - 1, i) ?? b / 2) : (a + b) / 2)
      i++
      continue
    }
    // Seconds i..last have unknown speed; the stretch from i - 1 to last + 1 takes the recorded gain.
    let last = i
    while (last + 1 < n && Number.isNaN(speed[last + 1]!)) last++
    const end = Math.min(n - 1, last + 1)
    const gained = recordedGain(recorded, i - 1, end)
    for (let k = i; k <= end; k++) {
      out[k] = out[k - 1]! + (gained === undefined ? 0 : gained / (end - i + 1))
    }
    i = end + 1
  }
  return out
}

/** The recorded distance gained from sample a to b, when both are known and it does not fall. */
function recordedGain(
  recorded: Float64Array | undefined,
  a: number,
  b: number,
): number | undefined {
  if (recorded === undefined || b <= a) return undefined
  const gain = recorded[b]! - recorded[a]!
  return Number.isFinite(gain) && gain >= 0 ? gain : undefined
}
