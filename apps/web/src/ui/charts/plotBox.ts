import type { PlotBox } from './chartTypes'
import { DEFAULT_ROOT_PX, rootFontPx } from './rootFont'

/** The plot's margins inside a chart's SVG, in px: room for the y axis on the left and the x axis below. */
export const PLOT_MARGIN = { top: 28, right: 16, bottom: 52, left: 56 }

/**
 * A phone's margins (a chart narrower than PHONE_CHART_WIDTH): a 40 px y gutter, which holds a tick label of
 * up to five characters and is otherwise set inside the plot by ChartYAxis, and a shorter band for the x axis.
 */
export const PLOT_MARGIN_PHONE = { top: 28, right: 12, bottom: 44, left: 40 }

/** Charts narrower than this, in px, take phone geometry: smaller margins, a shorter plot, a readout row. */
export const PHONE_CHART_WIDTH = 480

/** The height of a phone chart that does not set its own, so that its plot is about 190 px tall. */
export const PHONE_CHART_HEIGHT = 262

/** How far below the plot an x tick label's baseline sits, in px. */
export const X_TICK_BASELINE_PX = 18

/**
 * The bottom margin of a chart whose x axis has no title: room for the tick labels' descent below their
 * baseline, at the largest root size, and a small gap, with no band for a title.
 */
export const PLOT_BOTTOM_WITHOUT_X_TITLE = 30

/**
 * How much the chart's fixed geometry grows with the reader's text size: the px margins, the x axis's offsets
 * and the chart's height are laid out for a 16 px root, and the labels they hold are in rem. Never below 1, so
 * a reader who shrinks text keeps the geometry the layouts were drawn for.
 */
export function geometryScale(): number {
  return Math.max(1, rootFontPx() / DEFAULT_ROOT_PX)
}

/** Whether a chart of this width takes phone geometry. */
export function isPhoneWidth(width: number): boolean {
  return width < PHONE_CHART_WIDTH
}

/**
 * The plot's box in a chart of this size, with its right and bottom margins as given. A phone takes the
 * smaller margins where the chart does not set its own; a margin a chart gives is kept at every width. The
 * left, top and bottom margins grow with the reader's text size (geometryScale), and the height with them.
 */
export function plotBoxOf(
  width: number,
  height: number,
  rightMargin?: number,
  bottomMargin?: number,
  phone = false,
): PlotBox {
  const margin = phone ? PLOT_MARGIN_PHONE : PLOT_MARGIN
  const scale = geometryScale()
  const left = margin.left * scale
  return {
    left,
    // A right margin a chart gives is already measured at the reader's text size, as its end labels are.
    right: Math.max(left + 1, width - (rightMargin ?? margin.right)),
    top: margin.top * scale,
    bottom: height - (bottomMargin ?? margin.bottom) * scale,
  }
}
