import { PHONE_MAX_WIDTH_PX } from '../layoutBreakpoints'
import { useNarrowScreen } from '../useNarrowScreen'
import { PLOT_BOTTOM_WITHOUT_X_TITLE, PLOT_MARGIN, geometryScale } from './plotBox'

/** The plot's height on a phone, px: about 190, so the plot and the line of key above it fit one screen. */
const PHONE_PLOT_PX = 190
/** The plot's height on a wide screen, px. */
const WIDE_PLOT_PX = 280

/**
 * The height of a chart whose x axis has no title, so that its plot is PHONE_PLOT_PX tall on a phone and
 * WIDE_PLOT_PX tall on a wide screen: the margins above and below the plot are added to it. `plotPx`
 * replaces both plot heights, for a chart that wants a shorter strip. It grows with the reader's text size.
 */
export function useChartHeight(plotPx?: { phone: number; wide: number }): number {
  const phone = useNarrowScreen(PHONE_MAX_WIDTH_PX)
  const plot = plotPx ?? { phone: PHONE_PLOT_PX, wide: WIDE_PLOT_PX }
  return (
    ((phone ? plot.phone : plot.wide) + PLOT_MARGIN.top + PLOT_BOTTOM_WITHOUT_X_TITLE) *
    geometryScale()
  )
}
