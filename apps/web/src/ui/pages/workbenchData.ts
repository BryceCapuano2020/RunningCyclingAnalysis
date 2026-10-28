import { detectIntervals, distributionOf, summarizeSelection } from '@rca/core/workbench'
import type { ActivityLap, ActivityTrace, SelectionSummary, TraceMetric } from '@rca/core/workbench'
import { downsampleActivityTrace } from './workbenchDownsample'
import type { PlotRun } from './workbenchDownsample'
import { SPORT_READING } from './workbenchFormat'

export type DistributionBin = { from: number; to: number; seconds: number }

/** How many results of each trace are kept: a few selections and measures, then the oldest go. */
const KEPT_RESULTS = 48

const readable = new WeakMap<ActivityTrace, ActivityTrace>()
const results = new WeakMap<ActivityTrace, Map<string, unknown>>()

/**
 * The trace as the page reads it. A run's speed below a walking pace is dropped, since standing still
 * has no pace; it counts as moving time with no reading. Everything below reads this trace, so
 * the plot, the table and the histogram agree.
 */
export function readableTrace(trace: ActivityTrace): ActivityTrace {
  const cached = readable.get(trace)
  if (cached) return cached
  const stream = trace.streams.speed
  const floor = SPORT_READING[trace.sport].minSpeedMs
  let made = trace
  if (stream !== undefined && floor > 0) {
    const speed = stream.map((value) => (value < floor ? Number.NaN : value))
    made = { ...trace, streams: { ...trace.streams, speed } }
  }
  readable.set(trace, made)
  return made
}

/** A result for this trace and key, computed once. The same selection read again is not recomputed. */
function remembered<T>(trace: ActivityTrace, key: string, compute: () => T): T {
  let kept = results.get(trace)
  if (!kept) {
    kept = new Map()
    results.set(trace, kept)
  }
  if (kept.has(key)) return kept.get(key) as T
  const value = compute()
  if (kept.size >= KEPT_RESULTS) kept.delete(kept.keys().next().value as string)
  kept.set(key, value)
  return value
}

export function selectionOf(trace: ActivityTrace, startS: number, endS: number): SelectionSummary {
  return remembered(trace, `summary:${startS}:${endS}`, () =>
    summarizeSelection(readableTrace(trace), startS, endS),
  )
}

/** The histogram bins in the order the page reads them: a pace from its fastest bin to its slowest. */
export function distributionFor(
  trace: ActivityTrace,
  metric: TraceMetric,
  startS: number,
  endS: number,
): DistributionBin[] {
  return remembered(trace, `distribution:${metric}:${startS}:${endS}`, () => {
    // A measure that never moved has no spread to show.
    const stats = selectionOf(trace, startS, endS).metrics[metric]
    if (stats === undefined || stats.min === stats.max) return []
    const bins = distributionOf(readableTrace(trace), metric, startS, endS)
    return metric === 'speed' && SPORT_READING[trace.sport].speedIsPace ? bins.reverse() : bins
  })
}

export function plotRunsFor(
  trace: ActivityTrace,
  metric: TraceMetric,
  startS: number,
  endS: number,
): PlotRun[] {
  return remembered(trace, `plot:${metric}:${startS}:${endS}`, () =>
    downsampleActivityTrace(readableTrace(trace), metric, startS, endS, 600),
  )
}

export function suggestedIntervals(trace: ActivityTrace): ActivityLap[] {
  return remembered(trace, 'intervals', () => detectIntervals(readableTrace(trace)))
}
