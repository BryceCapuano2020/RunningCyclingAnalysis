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

/**
 * The share of readings cut from the low end of a band, and from its high end. A standing start, a stop or a
 * dropout leaves low readings that are not the athlete's, so the low end gives up two percent. The high end
 * is mostly real effort (strides, sprints, a descent), so it gives up only half a percent, which a few
 * seconds of glitch can reach and a stride cannot.
 */
export const BAND_TRIM_LOW = 0.02
export const BAND_TRIM_HIGH = 0.005

/**
 * The span of a measure's readings in a selection without the few at either end: from the 2nd to the
 * 99.5th percentile of its moving-time observations. It keeps a plot's axis from stretching over the empty
 * space a start or a stop leaves. With too few readings for a cut to remove one (under fifty at the low end, under two hundred at the high end), or when the band would collapse to one value, nothing is cut. Null with no readings.
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
  const low = values[Math.floor(values.length * BAND_TRIM_LOW)]!
  const high = values[values.length - 1 - Math.floor(values.length * BAND_TRIM_HIGH)]!
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
