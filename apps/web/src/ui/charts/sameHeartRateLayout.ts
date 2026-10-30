import type { SameHeartRateWeek } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import type { AxisTick, ChartSize, Point } from './chartTypes'
import { linearScale } from './scale'
import { plottedValue, sportYAxis } from './sportAxis'
import { fitTicks } from './ticks'
import { trendDateTicks } from './trendTicks'

/** The axis spans at least this share of the middle reading either way: the size of change worth a look. */
const AXIS_FLOOR = 0.05

export interface SameHeartRateLayout {
  xs: number[]
  /** Where each reported week's dot sits; null for a week with none. */
  dots: (Point | null)[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

/**
 * Where the weeks' dots sit. The axis holds every dot and its 90% interval, tight to them, but always covers a 5%
 * change either way of the middle reading, so that a steady output reads as steady.
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
  const values = weeks.flatMap((week) =>
    week.fit === null
      ? []
      : [week.fit.output, week.fit.low, week.fit.high].map((v) => plottedValue(sport, v, units)),
  )
  if (values.length === 0) return null
  const middle = (Math.min(...values) + Math.max(...values)) / 2
  const { y, ticks } = sportYAxis(
    sport,
    [...values, middle * (1 - AXIS_FLOOR), middle * (1 + AXIS_FLOOR)],
    plot,
    true,
  )
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
  }
}
