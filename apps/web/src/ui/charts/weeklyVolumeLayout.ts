import type { QuietGap } from '@rca/core/digest/trendSeries'
import type { Sport } from '@rca/core/types'
import { SPORT_ORDER } from '../sports'
import { formatHours, hoursOf, totalSeconds } from '../weeklyVolume'
import type { VolumeWeek } from '../weeklyVolume'
import type { AxisTick, ChartSize, PlotBox } from './chartTypes'
import { labelWidthPx, rootFontPx } from './rootFont'
import { linearScale, niceDomain, tickDecimals } from './scale'
import { timeScale } from './timeScale'
import type { TimeScale } from './timeScale'
import { fitTicks } from './ticks'
import { trendXTicks } from './trendTicks'

/** The widest a bar is drawn, in px. */
export const MAX_BAR_PX = 28
/** The share of the room between two bars that a bar fills. */
const BAR_FILL = 0.7
/** The share of the room to its neighbour that a bar at either end of the plot fills: it sits against the plot's edge, not centred. */
const EDGE_FILL = 0.6
/** The narrowest a bar is drawn, so that a long period still shows each row. */
const MIN_BAR_PX = 1
/** The space between two stacked parts of a bar, in px. */
export const STACK_GAP_PX = 2
/** The corner radius of a bar's top, in px, kept under half its width and its height. */
const TOP_RADIUS_PX = 4
/** How far the peak's label sits above its bar, in px. */
const PEAK_GAP_PX = 6
/**
 * The room kept under the plot's top for the peak's label, in root font sizes: the tallest bar stops short of the top
 * by the label's line and its gap, so the label lies inside the plot and never meets the axis title above it.
 */
const PEAK_ROOM_EM = 1

/** One sport's piece of a bar, in px: the sport it is, where it starts, how tall it is, and its outline. */
export interface BarSegment {
  sport: Sport
  y: number
  height: number
  /** The piece as a closed path: square at the foot, rounded at the top where it is the bar's top. */
  path: string
}

export interface VolumeBar {
  /**
   * The bar's left edge and width, centred on its row's x, or moved in to lie inside the plot where it
   * would cross an edge, so it never runs over the axis labels.
   */
  left: number
  width: number
  /** Bottom to top, in the order of the sports. A sport with no time has no segment. */
  segments: BarSegment[]
}

/** The label of the tallest bar: its hours, and where its text sits. */
export interface PeakLabel {
  text: string
  anchor: 'start' | 'middle' | 'end'
  x: number
  y: number
  index: number
}

export interface VolumeLayout {
  /** The pixel x of each row, which is where the trend puts the same week. */
  xs: number[]
  bars: VolumeBar[]
  /** Where each row's tooltip is anchored: the top of its bar, or the plot's bottom for a row without one. */
  ys: number[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
  peak: PeakLabel | null
  /** Where the time axis skips a gap of a year or more, to mark it. */
  breaks: TimeScale['breaks']
}

/** A rectangle from x to x + width and y to y + height, its top corners rounded by r (none when r is 0). */
function pieceOf(x: number, y: number, width: number, height: number, r: number): string {
  const f = (n: number) => Math.round(n * 10) / 10
  if (r <= 0) return `M${f(x)} ${f(y)}H${f(x + width)}V${f(y + height)}H${f(x)}Z`
  return (
    `M${f(x)} ${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}H${f(x + width - r)}` +
    `A${f(r)} ${f(r)} 0 0 1 ${f(x + width)} ${f(y + r)}V${f(y + height)}H${f(x)}Z`
  )
}

/** The middle of some numbers, which a few unusual ones do not move. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid]! : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

/**
 * The bar of one row: its sports stacked from the plot's bottom, each as tall as its hours, the top one
 * rounded. Each part above the first stops STACK_GAP_PX short of the one beneath it, so the parts are
 * apart without the bar growing, where the part is tall enough to give the gap up.
 */
function barOf(
  week: VolumeWeek,
  x: number,
  width: number,
  y: (hours: number) => number,
  plot: PlotBox,
): VolumeBar {
  const left = Math.min(Math.max(x - width / 2, plot.left), Math.max(plot.left, plot.right - width))
  const present = SPORT_ORDER.filter((sport) => week.seconds[sport] > 0)
  let top = y(0)
  const segments: BarSegment[] = present.map((sport, k) => {
    const next = top - (y(0) - y(hoursOf(week.seconds[sport])))
    const gap = k > 0 && top - next > STACK_GAP_PX + 1 ? STACK_GAP_PX : 0
    const bottom = top - gap
    const height = bottom - next
    const isTop = k === present.length - 1
    const r = isTop ? Math.min(TOP_RADIUS_PX, width / 2, height) : 0
    const segment = { sport, y: next, height, path: pieceOf(left, next, width, height, r) }
    top = next
    return segment
  })
  return { left, width, segments }
}

/** The label of the tallest row: its hours above its bar, kept inside the chart's two sides. */
function peakOf(
  weeks: readonly VolumeWeek[],
  bars: readonly VolumeBar[],
  xs: readonly number[],
  size: ChartSize,
): PeakLabel | null {
  let index = -1
  let tallest = 0
  weeks.forEach((week, i) => {
    const total = totalSeconds(week)
    if (total > tallest) {
      tallest = total
      index = i
    }
  })
  const bar = bars[index]
  const top = bar?.segments.at(-1)
  const x = xs[index]
  if (bar === undefined || top === undefined || x === undefined) return null
  const text = `${formatHours(tallest)} h`
  const half = labelWidthPx(text, rootFontPx()) / 2
  const y = top.y - PEAK_GAP_PX
  if (x - half < size.plot.left) return { text, anchor: 'start', x: bar.left, y, index }
  if (x + half > size.width - 2) return { text, anchor: 'end', x: bar.left + bar.width, y, index }
  return { text, anchor: 'middle', x, y, index }
}

/**
 * The drawn layout of the volume at a chart size. Its x scale is the trend's, from the first row's end to
 * the last at the plot's two edges, so a row's bar stands under that row's point. Null with fewer than two
 * rows, which has no scale.
 */
export function weeklyVolumeLayout(
  weeks: readonly VolumeWeek[],
  size: ChartSize,
  gaps: readonly QuietGap[] = [],
): VolumeLayout | null {
  const first = weeks[0]
  const last = weeks.at(-1)
  if (weeks.length < 2 || first === undefined || last === undefined) return null
  const { plot, width } = size
  const time = timeScale({ startMs: first.endMs, endMs: last.endMs, gaps }, [plot.left, plot.right])
  const x = time.x
  const peak = Math.max(...weeks.map((week) => hoursOf(totalSeconds(week))))
  const { domain, ticks } = niceDomain([0, peak], 3, 0)
  const y = linearScale(domain, [plot.bottom, plot.top + PEAK_GAP_PX + PEAK_ROOM_EM * rootFontPx()])
  const xs = weeks.map((week) => x(week.endMs))
  // The usual space between two rows sets how wide a bar is; a skipped gap is wider, and a partial month closer.
  const room = median(xs.slice(1).map((at, i) => at - xs[i]!))
  const barWidth = Math.min(MAX_BAR_PX, Math.max(MIN_BAR_PX, room * BAR_FILL))
  const decimals = tickDecimals(ticks)
  const bars = weeks.map((week, i) => {
    // No bar is wider than the room to its nearer neighbour, so a row close to the last, as a partial month is, never overlaps it.
    const near = Math.min(xs[i]! - (xs[i - 1] ?? -Infinity), (xs[i + 1] ?? Infinity) - xs[i]!)
    // A bar at either end is moved in to lie inside the plot, off its centre, so it keeps less of the room.
    const share = i === 0 || i === weeks.length - 1 ? EDGE_FILL : BAR_FILL
    const own = Math.max(MIN_BAR_PX, Math.min(barWidth, near * share))
    return barOf(week, xs[i]!, own, y, plot)
  })
  return {
    xs,
    bars,
    ys: bars.map((bar) => bar.segments.at(-1)?.y ?? plot.bottom),
    xTicks: trendXTicks(
      weeks.map((week) => week.endMs),
      x,
      size,
      gaps,
    ),
    yTicks: fitTicks(
      ticks.map((tick) => ({ position: y(tick), label: tick.toFixed(decimals) })),
      { axis: 'y', width },
    ),
    peak: peakOf(weeks, bars, xs, size),
    breaks: time.breaks,
  }
}
