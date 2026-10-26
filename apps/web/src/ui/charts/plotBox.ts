import type { PlotBox } from './chartTypes'

/** The plot's margins inside a chart's SVG, in px: room for the y axis on the left and the x axis below. */
export const PLOT_MARGIN = { top: 28, right: 16, bottom: 52, left: 56 }

/** How far below the plot an x tick label's baseline sits, in px. */
export const X_TICK_BASELINE_PX = 18

/**
 * The bottom margin of a chart whose x axis has no title: room for the tick labels' descent below their
 * baseline, at the largest root size, and a small gap, with no band for a title.
 */
export const PLOT_BOTTOM_WITHOUT_X_TITLE = 30

/** The plot's box in a chart of this size, with its right and bottom margins as given. */
export function plotBoxOf(
  width: number,
  height: number,
  rightMargin = PLOT_MARGIN.right,
  bottomMargin = PLOT_MARGIN.bottom,
): PlotBox {
  return {
    left: PLOT_MARGIN.left,
    right: Math.max(PLOT_MARGIN.left + 1, width - rightMargin),
    top: PLOT_MARGIN.top,
    bottom: height - bottomMargin,
  }
}
