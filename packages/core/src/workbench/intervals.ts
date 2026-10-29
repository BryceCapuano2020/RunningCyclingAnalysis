import { medianInPlace } from '../math'
import { isMovingSecond } from './moving'
import { isTraceObservation } from './selection'
import type { ActivityLap, ActivityTrace, TraceMetric } from './types'

const WINDOW_S = 30
const MIN_INTERVAL_S = 60

/**
 * Finds sustained mechanical step changes; returned segments are suggestions for editing. Each 30 s window
 * is compared with the activity's typical level, the median of its windows, so a walk to the start, a
 * stationary start or a slow warm-up does not set the level every later window is judged against.
 */
export function detectIntervals(trace: ActivityTrace): ActivityLap[] {
  const metric: TraceMetric = trace.streams.power !== undefined ? 'power' : 'speed'
  if (trace.streams[metric] === undefined || trace.durationS < WINDOW_S * 3) return []
  const means = windowMeans(trace, metric)
  const typical = medianOf(means)
  if (typical === null || typical <= 0) return []
  const threshold = metric === 'power' ? Math.max(40, typical * 0.25) : Math.max(0.5, typical * 0.2)
  const found: ActivityLap[] = []
  let start: number | null = null
  let direction = 0
  // A window's mean first differs once about half of it lies past a step, so the step is at the
  // window's centre, not its start.
  for (let at = 0; at < means.length; at++) {
    const current = means[at]!
    if (Number.isNaN(current)) continue
    const delta = current - typical
    const changed = Math.abs(delta) >= threshold
    const centre = at + WINDOW_S / 2
    if (start === null && changed) {
      start = centre
      direction = Math.sign(delta)
      continue
    }
    if (start !== null && (!changed || Math.sign(delta) !== direction)) {
      found.push({ startS: start, endS: centre, label: 'Inferred interval' })
      start = changed ? centre : null
      direction = changed ? Math.sign(delta) : 0
    }
  }
  if (start !== null)
    found.push({ startS: start, endS: trace.durationS, label: 'Inferred interval' })
  return found.flatMap((interval) => withoutGaps(trace, interval))
}

/**
 * The parts of an interval with no paused or unrecorded second, each long enough to be an interval.
 * An effort that stops and starts again is two efforts, not one that bridges the stop.
 */
function withoutGaps(trace: ActivityTrace, interval: ActivityLap): ActivityLap[] {
  const parts: ActivityLap[] = []
  let from = interval.startS
  for (let i = interval.startS; i <= interval.endS; i++) {
    const gap = i === interval.endS || !isMovingSecond(trace, i)
    if (!gap) continue
    if (i - from >= MIN_INTERVAL_S) parts.push({ ...interval, startS: from, endS: i })
    from = i + 1
  }
  return parts
}

/**
 * The mean of the usable observations in each window of WINDOW_S seconds, by the window's first second, or
 * NaN where under 80% of the window is usable. Found with running sums, so a long activity costs one pass.
 */
function windowMeans(trace: ActivityTrace, metric: TraceMetric): Float64Array {
  const values = trace.streams[metric]!
  const n = trace.durationS
  const counts = new Uint32Array(n + 1)
  const sums = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) {
    const usable = isTraceObservation(trace, metric, i)
    counts[i + 1] = counts[i]! + (usable ? 1 : 0)
    sums[i + 1] = sums[i]! + (usable ? values[i]! : 0)
  }
  const out = new Float64Array(Math.max(0, n - WINDOW_S + 1))
  for (let at = 0; at < out.length; at++) {
    const count = counts[at + WINDOW_S]! - counts[at]!
    out[at] = count >= WINDOW_S * 0.8 ? (sums[at + WINDOW_S]! - sums[at]!) / count : NaN
  }
  return out
}

/** The median of the windows that have a mean, or null when none does. */
function medianOf(means: Float64Array): number | null {
  const kept = means.filter((value) => !Number.isNaN(value))
  return kept.length === 0 ? null : medianInPlace(kept)
}
