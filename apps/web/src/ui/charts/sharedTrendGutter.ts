import { LABEL_GAP_X, spreadApart } from './chartInteraction'
import { ASCENT_EM, DESCENT_EM } from './chartBoxes'
import type { ChartSize, Point } from './chartTypes'
import type { SharedWeek } from './gradeTrend'
import { PLOT_MARGIN } from './plotBox'
import { labelSizePx, labelWidthPx, rootFontPx } from './rootFont'
import { formatValue } from './sharedTrendText'
import type { SharedMeasure } from './sharedTrendText'
import { NARROW_WIDTH } from './ticks'
import { SPORT_LABEL } from '../sports'
import type { EndLabel } from './sharedTrendLayout'

/** The widest an end label can be, "Ride 100%", which the gutter beside the plot is sized to hold. */
const WIDEST_LABEL = 'Ride 100%'

/**
 * The plot's right margin. A wide chart keeps a gutter beside the plot for the end labels, so they name the
 * lines without lying over their markers; a narrow one has no room to spare and sets them over the plot.
 * The chart under it, which shares the time axis, takes the same margin so the two line up.
 */
export function endLabelGutter(width: number): number {
  if (width < NARROW_WIDTH) return PLOT_MARGIN.right
  return Math.ceil(labelWidthPx(WIDEST_LABEL, rootFontPx())) + LABEL_GAP_X + PLOT_MARGIN.right / 4
}

/** The drawn points of a shared trend that the gutter labels read: each sport's line. */
interface Lines {
  run: (Point | null)[]
  ride: (Point | null)[]
}

/** The baselines that keep a label's box inside the plot's top and bottom. */
interface Span {
  lo: number
  hi: number
}

/**
 * The end labels in the gutter right of a wide plot, each level with its line's last point and spread
 * apart where the two points are close. Null when the plot leaves no gutter wide enough, or when a line ends before the
 * plot's right edge, where a label beside its end would lie over the plot: the labels are then placed
 * over the plot, clear of the lines.
 */
export function gutterLabels(
  weeks: readonly SharedWeek[],
  drawn: Lines,
  measure: SharedMeasure,
  size: ChartSize,
  span: Span,
): EndLabel[] | null {
  const rootPx = rootFontPx()
  const em = labelSizePx(rootPx)
  const ends = (['run', 'ride'] as const).flatMap((kind) => {
    const points = drawn[kind]
    const latest = points.findLastIndex((point) => point !== null)
    const point = points[latest] ?? null
    const value = weeks[latest]?.[kind] ?? null
    return point === null || value === null ? [] : [{ kind, point, value }]
  })
  const texts = ends.map(({ kind, value }) => `${SPORT_LABEL[kind]} ${formatValue(measure, value)}`)
  const widest = Math.max(0, ...texts.map((text) => labelWidthPx(text, rootPx)))
  // The gutter must hold the text; a plot with no gutter, as a narrow chart's, sets its labels over itself.
  if (ends.length === 0 || size.width - size.plot.right < LABEL_GAP_X + widest) return null
  if (ends.some(({ point }) => point.x < size.plot.right - 1)) return null
  const level = ((ASCENT_EM - DESCENT_EM) / 2) * em
  const ys = spreadApart(
    ends.map(({ point }) => point.y + level),
    (ASCENT_EM + DESCENT_EM) * em,
  )
  return ends.map(({ kind, point }, i) => ({
    kind,
    text: texts[i] ?? '',
    anchor: 'start',
    at: {
      x: point.x + LABEL_GAP_X,
      y: Math.min(Math.max(ys[i] ?? point.y, span.lo), Math.max(span.lo, span.hi)),
    },
  }))
}
