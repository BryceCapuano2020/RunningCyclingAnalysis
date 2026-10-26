import type { PlotBox } from './chartTypes'

/** The plot's margins inside a chart's SVG, in px: room for the y axis on the left and the x axis below. */
export const PLOT_MARGIN = { top: 28, right: 16, bottom: 52, left: 56 }

/**
 * The bottom margin of a chart whose x axis has no title: the tick labels sit 18 px below the plot and
 * end a few px lower, so this leaves them a small gap and no band for a title.
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
