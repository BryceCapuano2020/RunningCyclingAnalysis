import type { LiftRegion, LiftWeek } from '@rca/core/lift'
import type { AxisTick, ChartSize } from '../charts/chartTypes'
import { linearScale, niceDomain, tickDecimals } from '../charts/scale'
import { fitTicks } from '../charts/ticks'
import { shortDate } from '../charts/trendTicks'
import { utcMsOf } from './liftChartLayout'

/** The regions in the order the rows name them. */
export const REGIONS: readonly LiftRegion[] = ['upper', 'lower', 'other']

/** The widest a bar is drawn, px, and the share of its room it fills. */
const MAX_BAR_PX = 28
const BAR_FILL = 0.6

/** A week's working sets over every region. */
export const setsOf = (week: LiftWeek): number =>
  REGIONS.reduce((sum, region) => sum + week.regions[region].workingSets, 0)

export interface WeeklyLoadLayout {
  /** The pixel x of each week's bar, centred in its room. */
  xs: number[]
  /** Each bar's left edge, width and top, px; a week with no set has no height. */
  bars: { x: number; width: number; y: number; height: number }[]
  /** Where each week's tooltip sits: the top of its bar. */
  ys: number[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

/** One equal room per week with its bar of working sets from the plot's floor up. Null without weeks. */
export function weeklyLoadLayout(
  weeks: readonly LiftWeek[],
  size: ChartSize,
): WeeklyLoadLayout | null {
  if (weeks.length === 0) return null
  const { plot, width } = size
  const room = (plot.right - plot.left) / weeks.length
  const xs = weeks.map((_, i) => plot.left + room * (i + 0.5))
  const { domain, ticks } = niceDomain([0, Math.max(1, ...weeks.map(setsOf))], 3, 0)
  const y = linearScale(domain, [plot.bottom, plot.top])
  const barWidth = Math.min(MAX_BAR_PX, Math.max(1, room * BAR_FILL))
  const bars = weeks.map((week, i) => {
    const top = y(setsOf(week))
    return { x: xs[i]! - barWidth / 2, width: barWidth, y: top, height: plot.bottom - top }
  })
  const decimals = tickDecimals(ticks)
  return {
    xs,
    bars,
    ys: bars.map((bar) => bar.y),
    xTicks: fitTicks(
      weeks.map((week, i) => ({ position: xs[i]!, label: shortDate(utcMsOf(week.weekStart)) })),
      { axis: 'x', width },
    ),
    yTicks: fitTicks(
      ticks.map((tick) => ({ position: y(tick), label: tick.toFixed(decimals) })),
      { axis: 'y', width },
    ),
  }
}
