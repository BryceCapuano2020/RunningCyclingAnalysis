import { SPORT_LABEL } from '../sports'
import type { AxisTick, ChartSize, Point } from './chartTypes'
import { placeEndLabels } from './endLabels'
import type { PlacedLabel } from './endLabels'
import { isIsolated, meanPoint, runsOf } from './smoothPath'
import { linearScale, tickDecimals } from './scale'
import { timeScale } from './timeScale'
import type { TimeScale } from './timeScale'
import { axisTicksOf, yDomainOf } from './sharedTrendAxes'
import type { TrendRows } from './sharedTrendRows'
import { formatValue, plotted } from './sharedTrendText'

/** A value at the end of a line, named by its sport and value, such as "Run 64%". */
export type EndLabel = PlacedLabel<'run' | 'ride'>

/** Below this chart width an end label is its value alone, since its sport's colour and the key name it. */
export const VALUE_ONLY_WIDTH = 420

/** The mark a line's points have, by sport: a ring for an estimated ride, a dot for a run as recorded. */
const GLYPH: Record<'run' | 'ride', string> = { run: '●', ride: '○' }

/** Rows closer than this, in px, get no marker of their own; the line and its last point carry them. */
export const MARKER_SPACING_PX = 9

export interface SharedLayout {
  xs: number[]
  run: (Point | null)[]
  ride: (Point | null)[]
  /** The unbroken stretches of each line, as smoothed paths are drawn from them. */
  runRuns: Point[][]
  rideRuns: Point[][]
  /** The ride's 90% range, as stretches that pair with rideRuns. */
  lowRuns: Point[][]
  highRuns: Point[][]
  /** The stretches that are lines (more than two points), and the ride's range paired with them. */
  runLines: Point[][]
  rideLines: Point[][]
  bandHigh: Point[][]
  bandLow: Point[][]
  /** Each isolated stretch of two points or fewer, as the one marker at its mean. */
  isolatedRun: Point[]
  /** An isolated ride stretch: its marker and its 90% range, as the mean of the stretch's own. */
  isolatedRide: { at: Point; low: Point; high: Point }[]
  /** Where each row's tooltip is anchored: beside its first point. */
  ys: (number | null)[]
  labels: EndLabel[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
  /** Where the time axis skips a gap of a year or more, to mark it. */
  breaks: TimeScale['breaks']
  /** Whether every row has a marker: not where the rows are packed closer than MARKER_SPACING_PX. */
  markers: boolean
}

/**
 * What an end label says at this chart width: "Run 64%", or where the chart is narrow the value alone,
 * led by the mark the line's points have (a dot for a recorded value, a ring for an estimated one), which
 * the key explains.
 */
export function endLabelText(
  kind: 'run' | 'ride',
  value: number,
  width: number,
): { text: string; glyph?: string } {
  if (width >= VALUE_ONLY_WIDTH) return { text: `${SPORT_LABEL[kind]} ${formatValue(value)}` }
  return { text: formatValue(value), glyph: GLYPH[kind] }
}

/**
 * The drawn layout of a shared trend at a chart size: each sport's points and the stretches of line they
 * form, the ride's range, the end labels and the axes. Null with fewer than two rows, which is too few for
 * a line.
 */
export function sharedTrendLayout(data: TrendRows, size: ChartSize): SharedLayout | null {
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
  const values = rows
    .flatMap((row) => [row.run, row.ride, row.rideLow, row.rideHigh])
    .filter((value): value is number => value !== null)
    .map((value) => plotted(value))
  const { domain, ticks } = yDomainOf(values)
  const y = linearScale(domain, [plot.bottom, plot.top])
  const decimals = tickDecimals(ticks)
  const pointsOf = (pick: (row: (typeof rows)[number]) => number | null): (Point | null)[] =>
    rows.map((row) => {
      const value = pick(row)
      return value === null ? null : { x: x(row.endMs), y: y(plotted(value)) }
    })
  const run = pointsOf((row) => row.run)
  const ride = pointsOf((row) => row.ride)
  const low = pointsOf((row) => row.rideLow)
  const high = pointsOf((row) => row.rideHigh)
  const xs = rows.map((row) => x(row.endMs))
  const ends = (['run', 'ride'] as const).flatMap((kind) => {
    const points = { run, ride }[kind]
    const latest = points.findLastIndex((point) => point !== null)
    const point = points[latest]
    const value = rows[latest]?.[kind]
    return point == null || value == null
      ? []
      : [{ kind, point, ...endLabelText(kind, value, width) }]
  })
  const spacing = (plot.right - plot.left) / (rows.length - 1)
  const runRuns = runsOf(run, data.breaks.run)
  const rideRuns = runsOf(ride, data.breaks.ride)
  const lowRuns = runsOf(low, data.breaks.ride)
  const highRuns = runsOf(high, data.breaks.ride)
  const isLine = (_: Point[], i: number) => !isIsolated(rideRuns[i] ?? [], i, rideRuns)
  return {
    xs,
    run,
    ride,
    runRuns,
    rideRuns,
    lowRuns,
    highRuns,
    runLines: runRuns.filter((r, i) => !isIsolated(r, i, runRuns)),
    rideLines: rideRuns.filter(isLine),
    bandHigh: highRuns.filter(isLine),
    bandLow: lowRuns.filter(isLine),
    isolatedRun: runRuns.filter((r, i) => isIsolated(r, i, runRuns)).map(meanPoint),
    isolatedRide: rideRuns.flatMap((r, i) =>
      isIsolated(r, i, rideRuns) && lowRuns[i] && highRuns[i]
        ? [{ at: meanPoint(r), low: meanPoint(lowRuns[i]!), high: meanPoint(highRuns[i]!) }]
        : [],
    ),
    ys: rows.map((_, i) => (run[i] ?? ride[i])?.y ?? null),
    labels: placeEndLabels(ends, size),
    markers: spacing >= MARKER_SPACING_PX,
    breaks: time.breaks,
    ...axisTicksOf(rows, x, y, ticks, decimals, size, data.axis?.gaps ?? []),
  }
}
