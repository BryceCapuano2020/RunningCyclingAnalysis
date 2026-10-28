import { isTraceObservation } from '@rca/core/workbench'
import type { ActivityTrace, TraceMetric } from '@rca/core/workbench'

/** One unbroken stretch of readings, drawn as one line. */
export type PlotRun = { timeS: number; value: number }[]

/** The most missing seconds a line is drawn across. A longer stretch with no reading breaks it. */
const BRIDGED_GAP_S = 4

/** The readings of each stretch with no real gap in it, found over the selected seconds. */
function runsOf(trace: ActivityTrace, metric: TraceMetric, from: number, to: number): number[][] {
  const runs: number[][] = []
  let run: number[] | undefined
  let last = Number.NEGATIVE_INFINITY
  for (let i = from; i < to; i += 1) {
    if (!isTraceObservation(trace, metric, i)) continue
    if (run === undefined || i - last > BRIDGED_GAP_S + 1) {
      run = []
      runs.push(run)
    }
    run.push(i)
    last = i
  }
  return runs
}

/**
 * Reduce a stream for drawing. Each stretch of readings keeps its lowest and highest reading in every
 * bucket, in time order, so a short spike survives and no stretch is dropped, even a single reading.
 * The line breaks only where readings are missing for longer than BRIDGED_GAP_S seconds.
 */
export function downsampleActivityTrace(
  trace: ActivityTrace,
  metric: TraceMetric,
  startS: number,
  endS: number,
  limit: number,
): PlotRun[] {
  const stream = trace.streams[metric]
  if (!stream) return []
  const from = Math.max(0, Math.floor(startS))
  const to = Math.min(stream.length, Math.ceil(endS))
  // A bucket keeps four readings at most: the stretch's edges and its lowest and highest.
  const bucketSize = Math.max(1, Math.ceil((to - from) / Math.max(1, Math.floor(limit / 4))))
  return runsOf(trace, metric, from, to).map((indexes) => {
    const kept = new Set<number>([indexes[0]!, indexes.at(-1)!])
    for (let at = 0; at < indexes.length;) {
      const bucket = Math.floor((indexes[at]! - from) / bucketSize)
      let low = indexes[at]!
      let high = low
      while (at < indexes.length && Math.floor((indexes[at]! - from) / bucketSize) === bucket) {
        const index = indexes[at]!
        if (stream[index]! < stream[low]!) low = index
        if (stream[index]! > stream[high]!) high = index
        at += 1
      }
      kept.add(low)
      kept.add(high)
    }
    return [...kept].sort((a, b) => a - b).map((index) => ({ timeS: index, value: stream[index]! }))
  })
}
