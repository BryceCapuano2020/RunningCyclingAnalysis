import type { FitnessStatus } from '@rca/core/fitness'
import type { UnitSystem } from '@rca/core/units'
import type { AxisTick, ChartSize, Point } from './chartTypes'
import { linearScale } from './scale'
import { plottedValue, sportYAxis } from './sportAxis'
import { fitTicks } from './ticks'
import { trendDateTicks } from './trendTicks'

/** The axis spans at least this many seconds of pace, or this share of power, so a small change reads as small. */
const MIN_PACE_SPAN_S = 30

export interface FitnessLayout {
  /** Where each point sits across, in the order the arrow keys step through them. */
  xs: number[]
  line: Point[]
  /** The range's edges, left to right: the upper is the faster side on screen. */
  upper: Point[]
  lower: Point[]

  xTicks: AxisTick[]
  yTicks: AxisTick[]
  /** The level the change is read against. */
  referenceY: number
  /** The x of the month the change began; null when it has no date or began before the chart's first step. */
  onsetX: number | null
  /** The last point: the level now. */
  now: Point
}

/**
 * Where the level's points, their ranges, the reference line and the onset rule sit. The axis holds every
 * range and the reference, tight to them, so a few per cent are visible but never fill the plot.
 */
export function fitnessLayout(
  status: FitnessStatus,
  units: UnitSystem,
  size: ChartSize,
): FitnessLayout | null {
  const { series, before, sport } = status
  const first = series[0]
  const last = series.at(-1)
  if (series.length < 2 || first === undefined || last === undefined || before === null) return null
  const { plot, width } = size
  const x = linearScale([first.atMs, last.atMs], [plot.left, plot.right])
  const at = (output: number) => plottedValue(sport, output, units)
  const values = [at(before), ...series.flatMap((p) => [at(p.low), at(p.high)])]
  const { y, ticks } = sportYAxis(sport, values, plot, true, sport === 'run' ? MIN_PACE_SPAN_S : 0)
  const edge = (pick: (a: number, b: number) => number) =>
    series.map((p) => ({ x: x(p.atMs), y: pick(y(at(p.low)), y(at(p.high))) }))
  const onsetX = status.onsetMs === null ? null : x(status.onsetMs)
  return {
    xs: series.map((p) => x(p.atMs)),
    line: series.map((p) => ({ x: x(p.atMs), y: y(at(p.value)) })),
    upper: edge(Math.min),
    lower: edge(Math.max),
    xTicks: fitTicks(
      trendDateTicks(
        series.map((p) => p.atMs),
        x,
      ),
      { axis: 'x', width },
    ),
    yTicks: fitTicks(ticks, { axis: 'y', width }),
    referenceY: y(at(before)),
    onsetX: onsetX !== null && onsetX >= plot.left && onsetX <= plot.right ? onsetX : null,
    now: { x: x(last.atMs), y: y(at(last.value)) },
  }
}
