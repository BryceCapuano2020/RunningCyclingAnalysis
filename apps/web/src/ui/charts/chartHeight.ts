import { NARROW_CHART_MAX_WIDTH_PX, PHONE_MAX_WIDTH_PX } from '../layoutBreakpoints'
import { useNarrowScreen } from '../useNarrowScreen'
import { PLOT_BOTTOM_WITHOUT_X_TITLE, PLOT_MARGIN } from './plotBox'

/** The plot's height on a phone, px: about 190, so the plot and the line of key above it fit one screen. */
const PHONE_PLOT_PX = 190
/** The plot's height on a wide screen, px. */
const WIDE_PLOT_PX = 280

/**
 * Whether the window is narrow enough that a trend's end labels are values alone, led by their line's mark, so a
 * key is wanted to name the lines. Wider, the labels name their lines and the key is left out.
 */
export function useNarrowChart(): boolean {
  return useNarrowScreen(NARROW_CHART_MAX_WIDTH_PX)
}

/**
 * The height of a chart whose x axis has no title, so that its plot is PHONE_PLOT_PX tall on a phone and
 * WIDE_PLOT_PX tall on a wide screen: the margins above and below the plot are added to it. `plotPx`
 * replaces both plot heights, for a chart that wants a shorter strip.
 */
export function useChartHeight(plotPx?: { phone: number; wide: number }): number {
  const phone = useNarrowScreen(PHONE_MAX_WIDTH_PX)
  const plot = plotPx ?? { phone: PHONE_PLOT_PX, wide: WIDE_PLOT_PX }
  return (phone ? plot.phone : plot.wide) + PLOT_MARGIN.top + PLOT_BOTTOM_WITHOUT_X_TITLE
}
