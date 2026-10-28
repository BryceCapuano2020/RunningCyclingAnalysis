import type { ActivityTrace, ActivityLap, TraceMetric } from './types'

const WINDOW_S = 30
const MIN_INTERVAL_S = 60

/** Finds sustained mechanical step changes; returned segments are suggestions for editing. */
export function detectIntervals(trace: ActivityTrace): ActivityLap[] {
  const metric: TraceMetric | undefined = trace.streams.power !== undefined ? 'power' : 'speed'
  if (metric === undefined) return []
  const values = trace.streams[metric]!
  if (trace.durationS < WINDOW_S * 3) return []
  const baseline = mean(trace, values, metric, 0, WINDOW_S)
  if (baseline === null || baseline <= 0) return []
  const threshold =
    metric === 'power' ? Math.max(40, baseline * 0.25) : Math.max(0.5, baseline * 0.2)
  const intervals: ActivityLap[] = []
  let start: number | null = null
  let direction = 0
  for (let at = WINDOW_S; at + WINDOW_S <= trace.durationS; at++) {
    const current = mean(trace, values, metric, at, at + WINDOW_S)
    if (current === null) continue
    const delta = current - baseline
    const changed = Math.abs(delta) >= threshold
    if (start === null && changed) {
      start = at
      direction = Math.sign(delta)
      continue
    }
    if (start !== null && (!changed || Math.sign(delta) !== direction)) {
      const end = at
      if (end - start >= MIN_INTERVAL_S)
        intervals.push({ startS: start, endS: end, label: 'Inferred interval' })
      start = changed ? at : null
      direction = changed ? Math.sign(delta) : 0
    }
  }
  if (start !== null && trace.durationS - start >= MIN_INTERVAL_S) {
    intervals.push({ startS: start, endS: trace.durationS, label: 'Inferred interval' })
  }
  return intervals
}

function mean(
  trace: ActivityTrace,
  values: Float32Array,
  metric: TraceMetric,
  startS: number,
  endS: number,
): number | null {
  let count = 0
  let total = 0
  for (let i = startS; i < endS; i++) {
    const value = values[i]!
    if (
      trace.paused[i] === 1 ||
      trace.unrecorded[i] === 1 ||
      !Number.isFinite(value) ||
      value < 0 ||
      (metric === 'speed' && value > (trace.sport === 'run' ? 12.5 : 30)) ||
      (metric === 'power' && value > 3000)
    ) {
      continue
    }
    count++
    total += value
  }
  return count >= (endS - startS) * 0.8 ? total / count : null
}
