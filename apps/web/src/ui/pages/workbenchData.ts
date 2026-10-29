import {
  detectIntervals,
  isTraceObservation,
  readingBand,
  summarizeSelection,
} from '@rca/core/workbench'
import type {
  ActivityLap,
  ActivityTrace,
  ReadingBand,
  SelectionSummary,
  TraceMetric,
} from '@rca/core/workbench'
import { reduceSeries, smoothedStream } from '../charts/timeSeriesModel'
import type { SeriesColumns, SmoothedStream } from '../charts/timeSeriesModel'
import { SPORT_READING, TRIMMED_METRICS } from './workbenchFormat'

/** How many results of each trace are kept: a few selections and measures, then the oldest go. */
const KEPT_RESULTS = 48

const readable = new WeakMap<ActivityTrace, ActivityTrace>()
const results = new WeakMap<ActivityTrace, Map<string, unknown>>()

/**
 * The trace as the page reads it. A run's speed below a walking pace is dropped, since standing still
 * has no pace; it counts as moving time with no reading. Everything below reads this trace, so
 * the plot, the readout and the tables agree.
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

/**
 * What range a measure's readings span over a selection, and the moving seconds beyond each end. The
 * description of the plot and the stack's own axis read it; the axis then fits the smoothed line (smoothedBand).
 * A trimmed measure leaves out its few extreme readings; any other spans all of them. Null with no readings.
 */
export function axisFor(
  trace: ActivityTrace,
  metric: TraceMetric,
  startS: number,
  endS: number,
): ReadingBand | null {
  return remembered(trace, `axis:${metric}:${startS}:${endS}`, () => {
    const stats = selectionOf(trace, startS, endS).metrics[metric]
    if (stats === undefined || stats.min === null || stats.max === null) return null
    if (!TRIMMED_METRICS.includes(metric)) {
      return { low: stats.min, high: stats.max, below: 0, above: 0 }
    }
    return readingBand(readableTrace(trace), metric, startS, endS)
  })
}

/** The readings the page plots, per measure, with the running sums that smooth them. Made once per trace. */
const streams = new WeakMap<ActivityTrace, Map<TraceMetric, SmoothedStream | null>>()

/**
 * A measure's readings as the page reads them: a second that is paused, unrecorded or out of range has
 * none, so the line breaks there. Null for a measure the trace does not hold.
 */
export function plottedStream(trace: ActivityTrace, metric: TraceMetric): SmoothedStream | null {
  let kept = streams.get(trace)
  if (!kept) {
    kept = new Map()
    streams.set(trace, kept)
  }
  const known = kept.get(metric)
  if (known !== undefined) return known
  const read = readableTrace(trace)
  const raw = read.streams[metric]
  let made: SmoothedStream | null = null
  if (raw !== undefined) {
    const values = new Float32Array(raw.length)
    for (let i = 0; i < raw.length; i += 1) {
      values[i] = isTraceObservation(read, metric, i) ? raw[i]! : Number.NaN
    }
    made = smoothedStream(values)
  }
  kept.set(metric, made)
  return made
}

/** A measure over the window as columns for drawing: a rolling mean sized to the zoom, and the lowest and highest reading. */
export function seriesFor(
  trace: ActivityTrace,
  metric: TraceMetric,
  startS: number,
  endS: number,
  columns: number,
): SeriesColumns | null {
  return remembered(trace, `series:${metric}:${startS}:${endS}:${columns}`, () => {
    const stream = plottedStream(trace, metric)
    // Power's band leaves out the coasting zeros, which would otherwise pull it to the floor of the row.
    return stream === null ? null : reduceSeries(stream, startS, endS, columns, metric === 'power')
  })
}

/** How many columns the plot's axis is read from, whatever the plot's width, so the table and the plot agree. */
const DOMAIN_COLUMNS = 480
/** The share of the smoothed line cut from each end of a plot's axis. */
const DOMAIN_CUT = 0.01
/**
 * The least an axis spans, as a share of the raw readings' own span. A trend that hardly moves is drawn flat,
 * not stretched across the row until its jitter looks like a signal.
 */
const DOMAIN_MIN_SHARE = 0.2

/** The value a share of the way up ascending numbers. */
function atShare(sorted: readonly number[], share: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]!
}

/**
 * The span of a measure's smoothed line over a window, without the top and bottom hundredth: a spike or a
 * dropout is in the band and is marked on the row's edge, but does not set the axis the trend is read on.
 * Null with no readings.
 */
export function smoothedBand(
  trace: ActivityTrace,
  metric: TraceMetric,
  startS: number,
  endS: number,
): { low: number; high: number } | null {
  return remembered(trace, `smoothed:${metric}:${startS}:${endS}`, () => {
    const series = seriesFor(trace, metric, startS, endS, DOMAIN_COLUMNS)
    if (series === null) return null
    const sorted = (values: readonly number[]) =>
      values.filter(Number.isFinite).sort((a, b) => a - b)
    const means = sorted(series.mean)
    if (means.length === 0) return null
    let low = atShare(means, DOMAIN_CUT)
    let high = atShare(means, 1 - DOMAIN_CUT)
    const rawLow = atShare(sorted(series.lo), DOMAIN_CUT)
    const rawHigh = atShare(sorted(series.hi), 1 - DOMAIN_CUT)
    const least = (rawHigh - rawLow) * DOMAIN_MIN_SHARE
    if (high - low < least) {
      const middle = (low + high) / 2
      low = middle - least / 2
      high = middle + least / 2
    }
    return { low, high }
  })
}

export function suggestedIntervals(trace: ActivityTrace): ActivityLap[] {
  return remembered(trace, 'intervals', () => detectIntervals(readableTrace(trace)))
}
