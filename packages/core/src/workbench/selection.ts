import type { ActivityTrace, SelectionSummary, TraceMetric } from './types'

const RANGE: Partial<Record<TraceMetric, readonly [number, number]>> = {
  heartRate: [25, 250],
  temperature: [-80, 80],
  power: [0, 3000],
  cadence: [0, 300],
  speed: [0, 30],
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
    if (trace.unrecorded[i] !== 1 && trace.paused[i] !== 1) movingS++
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

/** A deterministic histogram of moving-time observations, with no more than ten equal-width bins. */
export function distributionOf(
  trace: ActivityTrace,
  metric: TraceMetric,
  startS: number,
  endS: number,
): Array<{ from: number; to: number; seconds: number }> {
  assertSelection(trace, startS, endS)
  const stream = trace.streams[metric]
  if (stream === undefined) return []
  const values: number[] = []
  for (let i = startS; i < endS; i++) {
    const value = stream[i]!
    if (!isTraceObservation(trace, metric, i)) continue
    values.push(value)
  }
  if (values.length === 0) return []
  let min = Infinity
  let max = -Infinity
  for (const value of values) {
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  const binCount = Math.min(10, Math.max(1, Math.ceil(Math.sqrt(values.length))))
  const width = max === min ? 1 : (max - min) / binCount
  const bins = Array.from({ length: binCount }, (_, index) => ({
    from: min + index * width,
    to: index === binCount - 1 ? max : min + (index + 1) * width,
    seconds: 0,
  }))
  for (const value of values) {
    const index = max === min ? 0 : Math.min(binCount - 1, Math.floor((value - min) / width))
    bins[index]!.seconds++
  }
  return bins
}

function distanceIn(trace: ActivityTrace, startS: number, endS: number): number | null {
  if (startS === endS) return 0
  // Interior selections have both cumulative boundary samples. At the activity's final second the
  // format has no extra endpoint, so clamp to the last recorded boundary rather than extrapolating.
  const lastBoundary = endS < trace.durationS ? endS : trace.durationS - 1
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

/** Whether sample i is a usable observation for the selected activity metric. */
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
    trace.paused[index] === 1 ||
    trace.unrecorded[index] === 1
  ) {
    return false
  }
  const value = stream[index]!
  if (!Number.isFinite(value)) return false
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

function rangeFor(
  trace: ActivityTrace,
  metric: TraceMetric,
): readonly [number, number] | undefined {
  if (metric === 'speed') return [0, trace.sport === 'run' ? 12.5 : 30]
  return RANGE[metric]
}
