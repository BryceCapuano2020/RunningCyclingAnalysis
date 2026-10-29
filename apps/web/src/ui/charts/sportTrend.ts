import { inGap, lineBreaks, rowBreaks, thinTrend, timeAxisOf } from '@rca/core/digest/trendSeries'
import type { TimeAxis } from '@rca/core/digest/trendSeries'
import type { TrendPoint } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { smallWidth } from './annotationTypes'
import { lineObstacles, markerObstacle } from './annotations'
import type { Annotation } from './annotations'
import type { Box } from './chartBoxes'
import { markerRadii } from './chartInteraction'
import type { AxisTick, ChartSize, Point } from './chartTypes'
import { PLOT_MARGIN } from './plotBox'
import { rootFontPx } from './rootFont'
import { timeScale } from './timeScale'
import type { TimeScale } from './timeScale'
import { fitTicks } from './ticks'
import { trendXTicks } from './trendTicks'
import { nativeValue } from '../records'
import { SPORT_FORMAT } from '../sports'
import { END_LABEL_MARGIN_PX, MARKER_SPACING_PX } from './sharedTrendLayout'
import { isIsolated, meanPoint, runsOf } from './smoothPath'
import { fittedYAxis, formatNative, plottedValue, usable } from './sportAxis'

/** One week of a sport's trend. */
export interface WeekRow {
  endMs: number
  /** The sport's own number: a speed in m/s for running, watts for cycling. Null where none. */
  value: number | null
  /** Activities in the window with a value. */
  count: number
  /**
   * The mechanical W/kg of the week's ride, at the body mass of the ride that set it, so a month averages the W/kg
   * of its weeks and not its watts over one week's mass. Null for a sport that names no W/kg, and where none.
   */
  wkg: number | null
}

/** A sport's weekly W/kg and activity count, read from the trend's own fields for that sport. */
const WEEK_OF: Record<
  Sport,
  (point: TrendPoint) => { wkg: number | null; count: number; massKg?: number }
> = {
  run: (point) => ({ wkg: point.runWkg, count: point.runCount }),
  ride: (point) => ({ wkg: point.rideWkg, count: point.rideCount, massKg: point.rideMassKg }),
}

export function weekRows(points: readonly TrendPoint[], sport: Sport, massKg: number): WeekRow[] {
  return points.map((point) => {
    // A ride's week is priced at the body mass of the ride that set it, when masses are dated.
    const { wkg, count, massKg: rideMassKg } = WEEK_OF[sport](point)
    const value = wkg === null ? NaN : usable(nativeValue(sport, wkg, rideMassKg ?? massKg))
    const known = Number.isFinite(value)
    return {
      endMs: point.endMs,
      value: known ? value : null,
      count,
      wkg: known && SPORT_FORMAT[sport].showsWkg ? value / (rideMassKg ?? massKg) : null,
    }
  })
}

export function hasValue(row: WeekRow): boolean {
  return row.value !== null
}

/** What a sport's trend draws: the weeks from its first value to its last, by the month past 26 weeks. */
export interface SportRows {
  rows: WeekRow[]
  /** The weeks the rows are made of, unthinned: what a title is judged on, so a week is compared with weeks. */
  weekly: WeekRow[]
  monthly: boolean
  /** For each row, how many weeks it stands for. */
  weeksIn: number[]
  /** For each row, whether its line starts afresh there after eight weeks or more with no value. */
  breaks: boolean[]
  /** Weeks left off the two ends, which hold no value of this sport: the chart does not draw them as empty. */
  trimmed: boolean
  /** The span the rows cover and the year-long gaps skipped between them: null when no week has a value. */
  axis: TimeAxis | null
}

/**
 * The rows of a sport's trend. The weeks before its first value and after its last are left off, so a sport
 * that came late to the library does not carry years of nothing; a stretch of a year or more with no value
 * is skipped, the axis marking it; and the rest are thinned to months past 26 weeks, with the breaks found on
 * the weeks.
 */
export function sportRowsOf(weekly: readonly WeekRow[]): SportRows {
  const axis = timeAxisOf(
    weekly.map((row) => row.endMs),
    weekly.map(hasValue),
  )
  const inSpan =
    axis === null
      ? []
      : weekly.filter((row) => row.endMs >= axis.startMs && row.endMs <= axis.endMs)
  const flags = lineBreaks(inSpan.map(hasValue))
  const live = inSpan.map((row) => axis === null || !inGap(axis.gaps, row.endMs))
  const kept = inSpan.filter((_, i) => live[i])
  const thinned = thinTrend(kept, ['value', 'wkg'])
  return {
    rows: thinned.rows.map(({ row }) => row),
    weekly: kept,
    monthly: thinned.monthly,
    weeksIn: thinned.rows.map(({ weeks }) => weeks.length),
    breaks: rowBreaks(
      thinned.rows,
      flags.filter((_, i) => live[i]),
    ),
    trimmed: inSpan.length < weekly.length,
    axis,
  }
}

/** The latest value's label text, such as "4:17 /km": the value alone, since the chart is one sport's. */
export function latestText(
  rows: readonly WeekRow[],
  sport: Sport,
  units: UnitSystem,
): string | null {
  const latest = rows.findLast(hasValue)
  return latest?.value == null ? null : formatNative(sport, latest.value, units)
}

/** The plot's right margin: the gutter that holds the latest value's label, or the usual margin without one. */
export function sportGutter(text: string | null): number {
  if (text === null) return PLOT_MARGIN.right
  return Math.ceil(smallWidth(text, rootFontPx())) + END_LABEL_MARGIN_PX
}

export interface SportLayout {
  xs: number[]
  points: (Point | null)[]
  runs: Point[][]
  /** The stretches that are lines (more than two points), and each isolated one as the one marker at its mean. */
  lines: Point[][]
  isolated: Point[]
  ys: (number | null)[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
  /** The latest value's end label, which the annotation layout places, and the data as boxes it keeps off. */
  annotations: Annotation[]
  obstacles: Box[]
  breaks: TimeScale['breaks']
  markers: boolean
}

/**
 * The drawn layout of a sport's trend at a chart size, on a y axis fitted to its own values. Null with
 * fewer than two rows.
 */
export function sportTrendLayout(
  data: SportRows,
  sport: Sport,
  units: UnitSystem,
  size: ChartSize,
): SportLayout | null {
  const { rows } = data
  const first = rows[0]
  const last = rows.at(-1)
  if (rows.length < 2 || first === undefined || last === undefined) return null
  const { plot, width } = size
  const time = timeScale({ startMs: first.endMs, endMs: last.endMs, gaps: data.axis?.gaps ?? [] }, [
    plot.left,
    plot.right,
  ])
  const x = time.x
  const plotted = (row: WeekRow) => plottedValue(sport, row.value ?? NaN, units)
  const { y, ticks } = fittedYAxis(sport, rows.filter(hasValue).map(plotted), plot)
  const points = rows.map((row) => (hasValue(row) ? { x: x(row.endMs), y: y(plotted(row)) } : null))
  const runs = runsOf(points, data.breaks)
  const latest = points.findLastIndex((point) => point !== null)
  const point = points[latest]
  const text = latestText(rows, sport, units)
  const annotations: Annotation[] =
    point == null || text === null ? [] : [{ kind: 'end', id: 'end', tone: sport, at: point, text }]
  return {
    xs: rows.map((row) => x(row.endMs)),
    points,
    runs,
    lines: runs.filter((r, i) => !isIsolated(r, i, runs)),
    isolated: runs.filter((r, i) => isIsolated(r, i, runs)).map(meanPoint),
    ys: points.map((p) => p?.y ?? null),
    xTicks: trendXTicks(
      rows.map((row) => row.endMs),
      x,
      size,
      data.axis?.gaps ?? [],
    ),
    yTicks: fitTicks(ticks, { axis: 'y', width }),
    annotations,
    obstacles: [
      ...lineObstacles(points),
      ...points.flatMap((p) => (p ? [markerObstacle(p, markerRadii(width).active)] : [])),
    ],
    breaks: time.breaks,
    markers: (plot.right - plot.left) / (rows.length - 1) >= MARKER_SPACING_PX,
  }
}
