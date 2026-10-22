import { rollingMean } from '../math'

const SMOOTHING_WINDOW = 30
/** Half the distance span over which grade is measured, in samples. */
const HALF_SPAN = 15
/** Total sample radius over which one altitude sample can influence smoothGrade. */
export const GRADE_SMOOTHING_MARGIN_S = Math.floor(SMOOTHING_WINDOW / 2) + HALF_SPAN
const MIN_SPAN_M = 5
const MAX_ABS_GRADE = 0.35

/**
 * Gradient (rise over run) at each sample. Altitude is smoothed with a rolling mean, then the
 * change across +/- 15 samples is divided by the distance over the same span. Spans shorter than
 * 5 m, or touching a NaN, give 0. A single altitude sample can influence grades within
 * GRADE_SMOOTHING_MARGIN_S samples.
 */
export function smoothGrade(altitude: Float64Array, distance: Float64Array): Float64Array {
  const n = altitude.length
  const grade = new Float64Array(n)
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
