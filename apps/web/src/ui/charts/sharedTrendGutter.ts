import { LABEL_GAP_X } from './chartInteraction'
import type { SharedWeek } from './gradeTrend'
import { PLOT_MARGIN } from './plotBox'
import { labelWidthPx, rootFontPx } from './rootFont'
import { endLabelText } from './sharedTrendLayout'
import type { TimeAxis } from '@rca/core/digest/trendSeries'
import { trendRowsOf } from './sharedTrendRows'
import { withRideHeld } from './sharedTrendText'

/**
 * The plot's right margin: the gutter the end labels sit in, sized to the widest of them so none of it is
 * reserved and unused. The chart under the trend, which shares its time axis, takes the same margin so the
 * two line up, which is why it is a function of width and not a number: the labels are shorter on a phone.
 */
export function trendGutter(
  weeks: readonly SharedWeek[],
  rideKnown = true,
  axis?: TimeAxis | null,
): (width: number) => number {
  const { rows } = trendRowsOf(rideKnown ? weeks : weeks.map(withRideHeld), axis)
  const latest = (kind: 'run' | 'ride') =>
    rows.findLast((row) => row[kind] !== null)?.[kind] ?? null
  return (width) => {
    const rootPx = rootFontPx()
    const texts = (['run', 'ride'] as const).flatMap((kind) => {
      const value = latest(kind)
      if (value === null) return []
      const { text, glyph } = endLabelText(kind, value, width)
      return [glyph === undefined ? text : `${glyph} ${text}`]
    })
    if (texts.length === 0) return PLOT_MARGIN.right
    const widest = Math.max(...texts.map((text) => labelWidthPx(text, rootPx)))
    return Math.ceil(widest) + LABEL_GAP_X + 4
  }
}
