import type { Box } from './chartBoxes'
import type { PlotBox } from './chartTypes'
import type { AxisTick } from './chartTypes'
import { smallWidth } from './annotationTypes'
import { DEFAULT_ROOT_PX } from './rootFont'

/** A y gutter narrower than this, px, is too small for its tick labels, so they sit inside the plot. */
export const INSIDE_TICK_GUTTER_PX = 48

/** The boxes a phone's y tick labels take, set inside the plot above their gridlines (see ChartYAxis). */
export function insideTickBoxes(
  ticks: readonly AxisTick[],
  plot: PlotBox,
  rootPx: number,
  gutterPx = INSIDE_TICK_GUTTER_PX,
): Box[] {
  if (plot.left >= gutterPx) return []
  const scale = rootPx / DEFAULT_ROOT_PX
  const em = 12 * scale
  return ticks.map((tick) => {
    const width = smallWidth(tick.label, rootPx)
    const baseline = tick.position - 5
    return {
      left: plot.left + 4,
      right: plot.left + 4 + width,
      top: baseline - em,
      bottom: baseline + 3,
    }
  })
}
