import type { SameHeartRateWeek } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import type { AxisTick, ChartSize, Point } from './chartTypes'
import { linearScale } from './scale'
import { plottedValue, sportYAxis } from './sportAxis'
import { trendInputs, trendOf } from './sameHeartRateTrend'
import { fitTicks } from './ticks'
import { trendDateTicks } from './trendTicks'

/** The axis spans at least this share of the middle reading either way: the size of change worth a look. */
const AXIS_FLOOR = 0.05
/** The band is drawn as this many segments a side: smooth to the eye, cheap to draw. */
const BAND_STEPS = 24
const WEEK_MS = 7 * 86_400_000

/** The fitted line and its band as drawn, with the value the line ends at. */
export interface DrawnTrend {
  line: [Point, Point]
  upper: Point[]
  lower: Point[]
  /** The line's value at its right end, in the unit the sport's output is in, for the end label. */
  endY: number
}

export interface SameHeartRateLayout {
  xs: number[]
  /** Where each reported week's dot sits; null for a week with none. */
  dots: (Point | null)[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
  /** The fitted line with its band; null with too few weeks to draw one. */
  trend: DrawnTrend | null
}

/**
 * Where the weeks' dots, the fitted line and its band sit. The axis holds every dot and the whole band, tight
 * to them, but always covers a 5% change either way of the middle reading, so that a steady output reads as steady.
 */
export function sameHeartRateLayout(
  weeks: readonly SameHeartRateWeek[],
  sport: Sport,
  units: UnitSystem,
  size: ChartSize,
): SameHeartRateLayout | null {
  const first = weeks[0]
  const last = weeks.at(-1)
  if (weeks.length < 2 || first === undefined || last === undefined) return null
  const { plot, width } = size
  const x = linearScale([first.endMs, last.endMs], [plot.left, plot.right])
  const inputs = trendInputs(weeks, sport, units, first.endMs)
  const fit = trendOf(inputs)
  // The line and its band run across the reporting weeks only, never past the first or last of them.
  const [t0, t1] = fit === null ? [0, 0] : [fit.from, fit.to]
  const ts = Array.from({ length: BAND_STEPS + 1 }, (_, i) => t0 + ((t1 - t0) * i) / BAND_STEPS)
  const values = [
    ...inputs.map((p) => p.y),
    ...(fit ? ts.flatMap((t) => [fit.at(t) - fit.half(t), fit.at(t) + fit.half(t)]) : []),
  ]
  const middle = (Math.min(...values) + Math.max(...values)) / 2
  const { y, ticks } = sportYAxis(
    sport,
    [...values, middle * (1 - AXIS_FLOOR), middle * (1 + AXIS_FLOOR)],
    plot,
    true,
  )
  const at = (t: number, value: number): Point => ({
    x: x(first.endMs + t * WEEK_MS),
    y: y(value),
  })
  return {
    xs: weeks.map((week) => x(week.endMs)),
    dots: weeks.map((week) =>
      week.fit === null
        ? null
        : { x: x(week.endMs), y: y(plottedValue(sport, week.fit.output, units)) },
    ),
    xTicks: fitTicks(
      trendDateTicks(
        weeks.map((week) => week.endMs),
        x,
      ),
      { axis: 'x', width },
    ),
    yTicks: fitTicks(ticks, { axis: 'y', width }),
    trend:
      fit === null
        ? null
        : {
            line: [at(t0, fit.at(t0)), at(t1, fit.at(t1))],
            upper: ts.map((t) => at(t, fit.at(t) + fit.half(t))),
            lower: ts.map((t) => at(t, fit.at(t) - fit.half(t))),
            endY: fit.at(t1),
          },
  }
}
