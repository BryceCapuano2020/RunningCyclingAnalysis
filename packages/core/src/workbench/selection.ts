import { isMovingSecond } from './moving'
import { SPORT_TRACE } from './sportTrace'
import type { ActivityTrace, SelectionSummary, TraceMetric } from './types'

const RANGE: Partial<Record<TraceMetric, readonly [number, number]>> = {
  heartRate: [25, 250],
  temperature: [-80, 80],
  power: [0, 3000],
  cadence: [0, 300],
  altitude: [-1000, 10000],
}

/** Summarizes integer-second selection bounds, with elapsed time kept separate from recorded time. */
export function summarizeSelection(
  trace: ActivityTrace,
  startS: number,
  endS: number,
): SelectionSummary {
  assertSelection(trace, startS, endS)
  let movingS = 0
  let recordedS = 0
  for (let i = startS; i < endS; i++) {
    if (trace.unrecorded[i] !== 1) recordedS++
    if (isMovingSecond(trace, i)) movingS++
  }
  const metrics: SelectionSummary['metrics'] = {}
  for (const [metric, stream] of Object.entries(trace.streams) as [TraceMetric, Float32Array][]) {
    let count = 0
    let sum = 0
    let min = Infinity
    let max = -Infinity
    for (let i = startS; i < endS; i++) {
      const value = stream[i]!
      if (!isTraceObservation(trace, metric, i)) continue
      count++
      sum += value
      min = Math.min(min, value)
      max = Math.max(max, value)
    }
    metrics[metric] = {
      mean: count > 0 ? sum / count : null,
      min: count > 0 ? min : null,
      max: count > 0 ? max : null,
      seconds: count,
    }
  }
  return {
    startS,
    endS,
    elapsedS: endS - startS,
    movingS,
    recordedS,
    distanceM: distanceIn(trace, startS, endS),
    metrics,
  }
}

function distanceIn(trace: ActivityTrace, startS: number, endS: number): number | null {
  if (startS === endS) return 0
  // Interior selections have both cumulative boundary samples. The activity's final second has no
  // closing sample, so a selection that reaches it measures up to the last sample, which makes a
  // whole-activity selection equal the activity's own total. A selection that starts at the last
  // sample would measure nothing for a second it covers, so its distance is unknown.
  const reachesEnd = endS === trace.durationS
  const lastBoundary = reachesEnd ? trace.durationS - 1 : endS
  if (reachesEnd && startS === lastBoundary) return null
  const first = trace.distance[startS]!
  const last = trace.distance[lastBoundary]!
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return null
  for (let i = startS; i <= lastBoundary; i++) {
    if (trace.unrecorded[i] === 1) return null
    const here = trace.distance[i]!
    if (!Number.isFinite(here)) return null
    if (i < lastBoundary) {
      const next = trace.distance[i + 1]!
      if (!Number.isFinite(next) || next < here) return null
    }
  }
  return last - first
}

/**
 * Whether sample i is a usable observation for the selected activity metric: a moving second with a
 * finite reading in the measure's range that the quality assessment kept (`trace.unusable`). Selection
 * summaries, reading bands, interval detection and time in zones all read through this, so they agree
 * with the digest about which seconds count.
 */
export function isTraceObservation(
  trace: ActivityTrace,
  metric: TraceMetric,
  index: number,
): boolean {
  const stream = trace.streams[metric]
  if (
    stream === undefined ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= trace.durationS ||
    !isMovingSecond(trace, index)
  ) {
    return false
  }
  const value = stream[index]!
  if (!Number.isFinite(value)) return false
  const masks: Partial<Record<TraceMetric, Uint8Array>> | undefined = trace.unusable
  if (masks?.[metric]?.[index] === 1) return false
  const range = rangeFor(trace, metric)
  return range === undefined || (value >= range[0] && value <= range[1])
}

function assertSelection(trace: ActivityTrace, startS: number, endS: number): void {
  if (
    !Number.isInteger(startS) ||
    !Number.isInteger(endS) ||
    startS < 0 ||
    endS < startS ||
    endS > trace.durationS
  ) {
    throw new RangeError('Selection bounds must be integer seconds within the activity')
  }
}

/** The values a stream may hold for this trace's sport; a value outside is not a measurement. */
function rangeFor(
  trace: ActivityTrace,
  metric: TraceMetric,
): readonly [number, number] | undefined {
  if (metric === 'speed') return [0, SPORT_TRACE[trace.sport].maxSpeedMs]
  return RANGE[metric]
}
