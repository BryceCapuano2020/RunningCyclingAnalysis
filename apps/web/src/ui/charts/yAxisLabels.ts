import type { Box } from './chartBoxes'
import type { AxisTick, PlotBox } from './chartTypes'
import { labelWidth, rootScale } from './ticks'

/** The gap, px, between a tick label and the plot's left edge. */
export const TICK_GAP = 8

/** How far above its gridline an inside label's baseline sits, px. */
export const INSIDE_LIFT = 5

/** How far above the plot's top edge the axis title's baseline sits, px. */
export const TITLE_RISE = 12

/** Whether the labels are set inside the plot, and which of them would run up into the title and so are left off. */
export function yLabelLayout(
  ticks: readonly AxisTick[],
  plot: PlotBox,
  title: string | undefined,
  fontSize: number,
) {
  const scale = rootScale()
  const widest = Math.max(0, ...ticks.map((tick) => labelWidth(tick.label, fontSize, scale)))
  const inside = widest + TICK_GAP > plot.left
  // The title's descent reaches 3 px below its baseline; an inside label reaches fontSize + INSIDE_LIFT above its line.
  const reachesTitle = (tick: AxisTick) =>
    inside && Boolean(title) && tick.position - INSIDE_LIFT - fontSize < plot.top - TITLE_RISE + 3
  return { inside, reachesTitle, scale }
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
