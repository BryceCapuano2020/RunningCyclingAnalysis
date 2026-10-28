import type { Sport } from '@rca/core/types'
import { SPORT_ORDER } from '../sports'
import { hoursOf, totalSeconds } from '../weeklyVolume'
import type { VolumeWeek } from '../weeklyVolume'
import type { AxisTick, ChartSize } from './chartTypes'
import { linearScale, niceDomain, tickDecimals } from './scale'
import { fitTicks } from './ticks'
import { trendDateTicks } from './trendTicks'

/** The widest a bar is drawn, in px. Half of it must fit in the plot's right margin, which is 16 px. */
export const MAX_BAR_PX = 24
/** The share of the room between two weeks that a bar fills. */
const BAR_FILL = 0.7
/** The narrowest a bar is drawn, so that a long period still shows each week. */
const MIN_BAR_PX = 1

/** One sport's piece of a week's bar, in px: the sport it is, where it starts and how tall it is. */
export interface BarSegment {
  sport: Sport
  y: number
  height: number
}

export interface VolumeBar {
  /** The bar's left edge and width, centred on the week's x. */
  left: number
  width: number
  /** Bottom to top, in the order of the sports. A sport with no time that week has no segment. */
  segments: BarSegment[]
}

export interface VolumeLayout {
  /** The pixel x of each week, which is where the trend puts the same week. */
  xs: number[]
  bars: VolumeBar[]
  /** Where each week's tooltip is anchored: the top of its bar, or the plot's bottom for a week without one. */
  ys: number[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

/** The bar of one week: its sports stacked from the plot's bottom, each as tall as its hours. */
function barOf(
  week: VolumeWeek,
  x: number,
  width: number,
  y: (hours: number) => number,
): VolumeBar {
  let top = y(0)
  const segments: BarSegment[] = []
  for (const sport of SPORT_ORDER) {
    const hours = hoursOf(week.seconds[sport])
    if (hours <= 0) continue
    const next = top - (y(0) - y(hours))
    segments.push({ sport, y: next, height: top - next })
    top = next
  }
  return { left: x - width / 2, width, segments }
}

/**
 * The drawn layout of the weekly volume at a chart size. Its x scale is the trend's, from the first
 * week's end to the last at the plot's two edges, so a week's bar stands under its point. Null with fewer
 * than two weeks, which has no scale.
 */
export function weeklyVolumeLayout(
  weeks: readonly VolumeWeek[],
  size: ChartSize,
): VolumeLayout | null {
  const first = weeks[0]
  const last = weeks.at(-1)
  if (weeks.length < 2 || first === undefined || last === undefined) return null
  const { plot, width } = size
  const x = linearScale([first.endMs, last.endMs], [plot.left, plot.right])
  const peak = Math.max(...weeks.map((week) => hoursOf(totalSeconds(week))))
  const { domain, ticks } = niceDomain([0, peak], 3, 0)
  const y = linearScale(domain, [plot.bottom, plot.top])
  const room = (plot.right - plot.left) / (weeks.length - 1)
  const barWidth = Math.min(MAX_BAR_PX, Math.max(MIN_BAR_PX, room * BAR_FILL))
  const decimals = tickDecimals(ticks)
  const bars = weeks.map((week) => barOf(week, x(week.endMs), barWidth, y))
  return {
    xs: weeks.map((week) => x(week.endMs)),
    bars,
    ys: bars.map((bar) => bar.segments.at(-1)?.y ?? plot.bottom),
    xTicks: fitTicks(
      trendDateTicks(
        weeks.map((week) => week.endMs),
        x,
      ),
      { axis: 'x', width },
    ),
    yTicks: fitTicks(
      ticks.map((tick) => ({ position: y(tick), label: tick.toFixed(decimals) })),
      { axis: 'y', width },
    ),
  }
}
