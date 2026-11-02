import type { Box } from './chartBoxes'
import type { AxisTick, PlotBox } from './chartTypes'
import { labelWidth, rootScale } from './ticks'

/** The gap, px, between a tick label and the plot's left edge. */
export const TICK_GAP = 8

/**
 * The least gap a label keeps where the gutter cannot give TICK_GAP. A phone's 40 px gutter holds a five-character
 * label, a pace of 10:00, at this gap; a wider label is set inside the plot.
 */
export const TICK_GAP_MIN = 4

/** How far above its gridline an inside label's baseline sits, px. */
export const INSIDE_LIFT = 5

/** How far above the plot's top edge the axis title's baseline sits, px. */
export const TITLE_RISE = 12

/**
 * Whether the labels are set inside the plot, where a series can cross them, and which of them would run up into
 * the title and so are left off; and the gap a label in the gutter keeps from the plot. A label stays in the gutter
 * whenever the widest keeps TICK_GAP_MIN there, so a gutter that holds it is never given up for a few pixels.
 */
export function yLabelLayout(
  ticks: readonly AxisTick[],
  plot: PlotBox,
  title: string | undefined,
  fontSize: number,
) {
  const scale = rootScale()
  const widest = Math.max(0, ...ticks.map((tick) => labelWidth(tick.label, fontSize, scale)))
  const room = plot.left - widest
  const inside = room < TICK_GAP_MIN
  const gap = Math.min(TICK_GAP, room)
  // The title's descent reaches 3 px below its baseline; an inside label reaches fontSize + INSIDE_LIFT above its line.
  const reachesTitle = (tick: AxisTick) =>
    inside && Boolean(title) && tick.position - INSIDE_LIFT - fontSize < plot.top - TITLE_RISE + 3
  return { inside, gap, reachesTitle, scale }
}

/**
 * The boxes of the labels drawn inside the plot, for a chart to keep its own labels clear of them. None where the
 * labels sit in the gutter, which nothing else is placed in.
 */
export function insideLabelBoxes(
  ticks: readonly AxisTick[],
  plot: PlotBox,
  title: string | undefined,
  fontSize = 12,
): Box[] {
  const { inside, reachesTitle, scale } = yLabelLayout(ticks, plot, title, fontSize)
  if (!inside) return []
  return ticks
    .filter((tick) => !reachesTitle(tick))
    .map((tick) => ({
      left: plot.left + 4,
      right: plot.left + 4 + labelWidth(tick.label, fontSize, scale),
      top: tick.position - INSIDE_LIFT - fontSize,
      bottom: tick.position - INSIDE_LIFT + 3,
    }))
}
