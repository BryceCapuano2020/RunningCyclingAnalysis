import type { PlotBox } from './chartTypes'

/** The plot's margins inside a chart's SVG, in px: room for the y axis on the left and the x axis below. */
export const PLOT_MARGIN = { top: 28, right: 16, bottom: 52, left: 56 }

/** The plot's box in a chart of this size, with its right margin as given. */
export function plotBoxOf(width: number, height: number, rightMargin = PLOT_MARGIN.right): PlotBox {
  return {
    left: PLOT_MARGIN.left,
    right: Math.max(PLOT_MARGIN.left + 1, width - rightMargin),
    top: PLOT_MARGIN.top,
    bottom: height - PLOT_MARGIN.bottom,
  }
}
