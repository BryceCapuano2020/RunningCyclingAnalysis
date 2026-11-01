import type { YearRow } from '@rca/core/history'
import { SPORT_ORDER } from '../sports'
import { hoursOf, totalSeconds } from '../weeklyVolume'
import type { VolumeWeek } from '../weeklyVolume'
import type { AxisTick, ChartSize } from './chartTypes'
import { rootFontPx } from './rootFont'
import { linearScale, niceDomain, tickDecimals } from './scale'
import { fitTicks } from './ticks'
import { barOf, MAX_BAR_PX, PEAK_GAP_PX, PEAK_ROOM_EM, peakOf } from './weeklyVolumeLayout'
import type { PeakLabel, VolumeBar } from './weeklyVolumeLayout'

/** The share of a year's room that its bar fills. */
const BAR_FILL = 0.6

/** A year as a week of the volume strip, so the two draw the same stacked bar. */
export function volumeOfYear(row: YearRow): VolumeWeek {
  const seconds = Object.fromEntries(SPORT_ORDER.map((s) => [s, row.sports[s].hours * 3600]))
  return { endMs: row.year, seconds: seconds as VolumeWeek['seconds'] }
}

export interface HoursPerYearLayout {
  /** The pixel x of each year's bar, centred in its room. */
  xs: number[]
  bars: VolumeBar[]
  /** Where each year's tooltip sits: the top of its bar, or the plot's bottom for a year with no hours. */
  ys: number[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
  peak: PeakLabel | null
}

/**
 * One equal room for each calendar year with a bar in its middle, so a year with nothing in it is an empty room.
 * Null without years.
 */
export function hoursPerYearLayout(
  years: readonly YearRow[],
  size: ChartSize,
): HoursPerYearLayout | null {
  if (years.length === 0) return null
  const { plot, width } = size
  const weeks = years.map(volumeOfYear)
  const room = (plot.right - plot.left) / years.length
  const xs = years.map((_, i) => plot.left + room * (i + 0.5))
  const tallest = Math.max(...weeks.map((week) => hoursOf(totalSeconds(week))))
  const { domain, ticks } = niceDomain([0, tallest], 3, 0)
  const y = linearScale(domain, [plot.bottom, plot.top + PEAK_GAP_PX + PEAK_ROOM_EM * rootFontPx()])
  const barWidth = Math.min(MAX_BAR_PX, Math.max(1, room * BAR_FILL))
  const bars = weeks.map((week, i) => barOf(week, xs[i]!, barWidth, y, plot))
  const decimals = tickDecimals(ticks)
  return {
    xs,
    bars,
    ys: bars.map((bar) => bar.segments.at(-1)?.y ?? plot.bottom),
    xTicks: fitTicks(
      years.map((row, i) => ({ position: xs[i]!, label: String(row.year) })),
      { axis: 'x', width },
    ),
    yTicks: fitTicks(
      ticks.map((tick) => ({ position: y(tick), label: tick.toFixed(decimals) })),
      { axis: 'y', width },
    ),
    peak: peakOf(weeks, bars, xs, size),
  }
}
