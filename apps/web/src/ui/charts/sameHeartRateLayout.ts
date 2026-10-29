import type { SameHeartRateWeek } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import type { AxisTick, ChartSize, Point } from './chartTypes'
import { linearScale } from './scale'
import { plottedValue, sportYAxis } from './sportAxis'
import { trendOf } from './sameHeartRateTrend'
import type { TrendInput } from './sameHeartRateTrend'
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

/** The weeks that report, as the trend's input: time in weeks from the first, and the plotted values. */
function inputsOf(
  weeks: readonly SameHeartRateWeek[],
  sport: Sport,
  units: UnitSystem,
  startMs: number,
): TrendInput[] {
  return weeks.flatMap((week) => {
    if (week.fit === null) return []
    const [low, high] = [week.fit.low, week.fit.high].map((v) => plottedValue(sport, v, units))
    return [
      {
        t: (week.endMs - startMs) / WEEK_MS,
        y: plottedValue(sport, week.fit.output, units),
        low: low!,
        high: high!,
      },
    ]
  })
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
  const inputs = inputsOf(weeks, sport, units, first.endMs)
  const fit = trendOf(inputs)
  const tEnd = (last.endMs - first.endMs) / WEEK_MS
  const ts = Array.from({ length: BAND_STEPS + 1 }, (_, i) => (tEnd * i) / BAND_STEPS)
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
            line: [at(0, fit.at(0)), at(tEnd, fit.at(tEnd))],
            upper: ts.map((t) => at(t, fit.at(t) + fit.half(t))),
            lower: ts.map((t) => at(t, fit.at(t) - fit.half(t))),
            endY: fit.at(tEnd),
          },
  }
}
