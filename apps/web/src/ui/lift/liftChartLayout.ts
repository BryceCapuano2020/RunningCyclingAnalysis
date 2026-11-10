import type { LiftHistoryPoint } from '@rca/core/lift'
import { groupThousands, kgToLb } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import type { AxisTick, ChartSize, Point } from '../charts/chartTypes'
import { linearScale, niceDomain, tickDecimals } from '../charts/scale'
import { fitTicks } from '../charts/ticks'
import { trendDateTicks } from '../charts/trendTicks'

/** Noon UTC of a YYYY-MM-DD date: the instant the date axis names by its UTC day. */
export function utcMsOf(date: string): number {
  return Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    12,
  )
}

/** A load in the unit the axis shows. */
export const axisLoad = (kg: number, units: UnitSystem): number =>
  units === 'imperial' ? kgToLb(kg) : kg

export interface LiftChartLayout {
  /** Where each session's point sits across, in the order the arrow keys step through them. */
  xs: number[]
  line: Point[]
  upper: Point[]
  lower: Point[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

/** Where a lift's estimates and their 80% ranges sit; null with fewer than two sessions, which draw no line. */
export function liftChartLayout(
  history: readonly LiftHistoryPoint[],
  units: UnitSystem,
  size: ChartSize,
): LiftChartLayout | null {
  const first = history[0]
  const last = history.at(-1)
  if (history.length < 2 || first === undefined || last === undefined) return null
  const { plot, width } = size
  const x = linearScale([utcMsOf(first.date), utcMsOf(last.date)], [plot.left, plot.right])
  const at = (kg: number) => axisLoad(kg, units)
  const { domain, ticks } = niceDomain(
    history.flatMap((p) => [at(p.low), at(p.high)]),
    4,
  )
  const y = linearScale(domain, [plot.bottom, plot.top])
  const decimals = tickDecimals(ticks)
  return {
    xs: history.map((p) => x(utcMsOf(p.date))),
    line: history.map((p) => ({ x: x(utcMsOf(p.date)), y: y(at(p.point)) })),
    upper: history.map((p) => ({ x: x(utcMsOf(p.date)), y: y(at(p.high)) })),
    lower: history.map((p) => ({ x: x(utcMsOf(p.date)), y: y(at(p.low)) })),
    xTicks: fitTicks(
      trendDateTicks(
        history.map((p) => utcMsOf(p.date)),
        x,
      ),
      { axis: 'x', width },
    ),
    yTicks: fitTicks(
      ticks.map((tick) => ({
        position: y(tick),
        label: groupThousands(tick.toFixed(decimals)),
      })),
      { axis: 'y', width },
    ),
  }
}
