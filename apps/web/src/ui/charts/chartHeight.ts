import { useEffect, useState } from 'react'
import { PHONE_MAX_WIDTH_PX } from '../layoutBreakpoints'
import { PLOT_BOTTOM_WITHOUT_X_TITLE, PLOT_MARGIN } from './plotBox'

/** The plot's height on a phone, px: about 190, so the plot and the line of key above it fit one screen. */
const PHONE_PLOT_PX = 190
/** The plot's height on a wide screen, px. */
const WIDE_PLOT_PX = 280

const QUERY = `(max-width: ${PHONE_MAX_WIDTH_PX}px)`
/** The viewport width at or below which a chart is narrow enough that its end labels are values alone, which a key explains. */
const NARROW_QUERY = '(max-width: 500px)'

/** Whether the window matches a media query. False without matchMedia, as in a test. */
function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false
}

/** Whether the window matches a media query, kept up to date as it is resized. */
function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => matches(query))
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(query)
    const update = () => setOn(list.matches)
    update()
    list.addEventListener('change', update)
    return () => list.removeEventListener('change', update)
  }, [query])
  return on
}

/**
 * Whether the window is narrow enough that a trend's end labels are values alone, led by their line's mark, so a
 * key is wanted to name the lines. Wider, the labels name their lines and the key is left out.
 */
export function useNarrowChart(): boolean {
  return useMedia(NARROW_QUERY)
}

/**
 * The height of a chart whose x axis has no title, so that its plot is PHONE_PLOT_PX tall on a phone and
 * WIDE_PLOT_PX tall on a wide screen: the margins above and below the plot are added to it. `plotPx`
 * replaces both plot heights, for a chart that wants a shorter strip.
 */
export function useChartHeight(plotPx?: { phone: number; wide: number }): number {
  const phone = useMedia(QUERY)
  const plot = plotPx ?? { phone: PHONE_PLOT_PX, wide: WIDE_PLOT_PX }
  return (phone ? plot.phone : plot.wide) + PLOT_MARGIN.top + PLOT_BOTTOM_WITHOUT_X_TITLE
}
