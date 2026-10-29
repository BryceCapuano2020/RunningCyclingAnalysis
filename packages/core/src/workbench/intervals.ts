import { isMovingSecond } from './moving'
import { isTraceObservation } from './selection'
import type { ActivityLap, ActivityTrace, TraceMetric } from './types'

const WINDOW_S = 30
const MIN_INTERVAL_S = 60

/** Finds sustained mechanical step changes; returned segments are suggestions for editing. */
export function detectIntervals(trace: ActivityTrace): ActivityLap[] {
  const metric: TraceMetric = trace.streams.power !== undefined ? 'power' : 'speed'
  if (trace.streams[metric] === undefined || trace.durationS < WINDOW_S * 3) return []
  const baseline = mean(trace, metric, 0, WINDOW_S)
  if (baseline === null || baseline <= 0) return []
  const threshold =
    metric === 'power' ? Math.max(40, baseline * 0.25) : Math.max(0.5, baseline * 0.2)
  const found: ActivityLap[] = []
  let start: number | null = null
  let direction = 0
  // A window's mean first differs once about half of it lies past a step, so the step is at the
  // window's centre, not its start.
  for (let at = WINDOW_S; at + WINDOW_S <= trace.durationS; at++) {
    const current = mean(trace, metric, at, at + WINDOW_S)
    if (current === null) continue
    const delta = current - baseline
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

/** The mean of the usable observations in the window, or null when under 80% of it is usable. */
function mean(
  trace: ActivityTrace,
  metric: TraceMetric,
  startS: number,
  endS: number,
): number | null {
  const values = trace.streams[metric]!
  let count = 0
  let total = 0
  for (let i = startS; i < endS; i++) {
    if (!isTraceObservation(trace, metric, i)) continue
    count++
    total += values[i]!
  }
  return count >= (endS - startS) * 0.8 ? total / count : null
}
