import { isTraceObservation } from './selection'
import type { ActivityTrace, TraceMetric } from './types'

/** A measure's readings between two quantiles, and how many moving seconds fell outside them. */
export interface ReadingBand {
  /** The lowest and highest reading inside the band. */
  low: number
  high: number
  /** Moving seconds with a reading below `low` and above `high`. */
  below: number
  above: number
}

/** The share of readings cut from each end of a band. */
export const BAND_TRIM = 0.02

/**
 * The span of a measure's readings in a selection without the few at either end: from the 2nd to the 98th
 * percentile of its moving-time observations. A standing start or a stop leaves a handful of extreme
 * readings that would stretch a plot's axis over empty space; the band is what the rest span. With fewer
 * than fifty readings, or when the band would collapse to one value, nothing is cut. Null with no readings.
 */
export function readingBand(
  trace: ActivityTrace,
  metric: TraceMetric,
  startS: number,
  endS: number,
): ReadingBand | null {
  const stream = trace.streams[metric]
  if (stream === undefined) return null
  const values: number[] = []
  for (let i = startS; i < endS; i++) {
    if (isTraceObservation(trace, metric, i)) values.push(stream[i]!)
  }
  if (values.length === 0) return null
  values.sort((a, b) => a - b)
  const cut = Math.floor(values.length * BAND_TRIM)
  const low = values[cut]!
  const high = values[values.length - 1 - cut]!
  if (low === high && values[0] !== values.at(-1)) {
    return { low: values[0]!, high: values.at(-1)!, below: 0, above: 0 }
  }
  return {
    low,
    high,
    below: values.filter((value) => value < low).length,
    above: values.filter((value) => value > high).length,
  }
}
