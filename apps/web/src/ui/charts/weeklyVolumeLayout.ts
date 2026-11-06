import type { Sport } from '@rca/core/types'
import { SPORT_ORDER } from '../sports'
import { formatHours, hoursOf, totalSeconds } from '../weeklyVolume'
import type { VolumeWeek } from '../weeklyVolume'
import type { ChartSize, PlotBox } from './chartTypes'
import { labelWidthPx, rootFontPx } from './rootFont'

/** The widest a bar is drawn, in px. */
export const MAX_BAR_PX = 28
/** The space between two stacked parts of a bar, in px. */
export const STACK_GAP_PX = 2
/** The corner radius of a bar's top, in px, kept under half its width and its height. */
const TOP_RADIUS_PX = 4
/** How far the peak's label sits above its bar, in px. */
export const PEAK_GAP_PX = 6
/**
 * The room kept under the plot's top for the peak's label, in root font sizes: the tallest bar stops short of the top
 * by the label's line and its gap, so the label lies inside the plot and never meets the axis title above it.
 */
export const PEAK_ROOM_EM = 1

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

/** A rectangle from x to x + width and y to y + height, its top corners rounded by r (none when r is 0). */
function pieceOf(x: number, y: number, width: number, height: number, r: number): string {
  const f = (n: number) => Math.round(n * 10) / 10
  if (r <= 0) return `M${f(x)} ${f(y)}H${f(x + width)}V${f(y + height)}H${f(x)}Z`
  return (
    `M${f(x)} ${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}H${f(x + width - r)}` +
    `A${f(r)} ${f(r)} 0 0 1 ${f(x + width)} ${f(y + r)}V${f(y + height)}H${f(x)}Z`
  )
}

/**
 * The bar of one row: its sports stacked from the plot's bottom, each as tall as its hours, the top one
 * rounded. Each part above the first stops STACK_GAP_PX short of the one beneath it, so the parts are
 * apart without the bar growing, where the part is tall enough to give the gap up.
 */
export function barOf(
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
export function peakOf(
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
