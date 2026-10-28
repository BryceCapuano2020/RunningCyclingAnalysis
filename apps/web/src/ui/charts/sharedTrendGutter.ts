import { LABEL_GAP_X } from './chartInteraction'
import { ASCENT_EM, DESCENT_EM } from './chartBoxes'
import type { ChartSize, Point } from './chartTypes'
import type { SharedWeek } from './gradeTrend'
import { thinToMonths } from './monthlyTrend'
import { PLOT_MARGIN } from './plotBox'
import { labelSizePx, labelWidthPx, rootFontPx } from './rootFont'
import { formatValue } from './sharedTrendText'
import type { SharedMeasure } from './sharedTrendText'
import { NARROW_WIDTH } from './ticks'
import { SPORT_LABEL } from '../sports'
import type { EndLabel } from './sharedTrendLayout'

/**
 * The text of each sport's end label: its name and its latest value, such as "Run 56%" or "Ride 8.2 W/kg".
 * A held ride, whose value waits for the weight, has none.
 */
export function endLabelTexts(
  weeks: readonly SharedWeek[],
  measure: SharedMeasure,
  rideKnown = true,
): string[] {
  const kinds = rideKnown ? (['run', 'ride'] as const) : (['run'] as const)
  return kinds.flatMap((kind) => {
    const latest = weeks.findLast((week) => week[kind] !== null)?.[kind] ?? null
    return latest === null ? [] : [`${SPORT_LABEL[kind]} ${formatValue(measure, latest)}`]
  })
}

/**
 * The plot's right margin. A wide chart keeps a gutter beside the plot for its end labels, sized to the
 * widest of their texts so none of it is reserved and unused, and the labels name the lines without lying
 * over their markers; a narrow one has no room to spare and sets them over the plot. The chart under it,
 * which shares the time axis, takes the same margin so the two line up.
 */
export function endLabelGutter(width: number, texts: readonly string[]): number {
  if (width < NARROW_WIDTH || texts.length === 0) return PLOT_MARGIN.right
  const rootPx = rootFontPx()
  const widest = Math.max(...texts.map((text) => labelWidthPx(text, rootPx)))
  return Math.ceil(widest) + LABEL_GAP_X + PLOT_MARGIN.right / 4
}

/**
 * The right margin of the trend drawn from these weeks, as a function of the chart's width: the gutter its end
 * labels need. The labels read the weeks the chart draws, which past 13 months are the thinned ones, whose
 * latest valued week can be an earlier week than the latest of all. The chart and the strip under it both
 * take their margin from here, so the two are always given the same one.
 */
export function trendGutter(
  weeks: readonly SharedWeek[],
  measure: SharedMeasure,
  rideKnown = true,
): (width: number) => number {
  const texts = endLabelTexts(thinToMonths(weeks).weeks, measure, rideKnown)
  return (width) => endLabelGutter(width, texts)
}

/**
 * Spreads baselines apart, in order, so that each sits at least `gap` below the one above it, and inside
 * [lo, hi]. Each is clamped first, then packed down from lo and back up from hi, so two at the foot keep
 * their gap instead of piling on one another. Returned in the input's order.
 */
function spreadWithin(ys: readonly number[], gap: number, lo: number, hi: number): number[] {
  const top = Math.min(lo, hi)
  const bottom = Math.max(lo, hi)
  const placed = ys.map((y, index) => ({ y: Math.min(Math.max(y, top), bottom), index }))
  const order = [...placed].sort((a, b) => a.y - b.y)
  let floor = top
  for (const item of order) {
    item.y = Math.max(item.y, floor)
    floor = item.y + gap
  }
  let ceiling = bottom
  for (const item of [...order].reverse()) {
    item.y = Math.min(item.y, ceiling)
    ceiling = item.y - gap
  }
  return placed.map((item) => item.y)
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
  const ys = spreadWithin(
    ends.map(({ point }) => point.y + level),
    (ASCENT_EM + DESCENT_EM) * em,
    span.lo,
    span.hi,
  )
  return ends.map(({ kind, point }, i) => ({
    kind,
    text: texts[i] ?? '',
    anchor: 'start',
    at: { x: point.x + LABEL_GAP_X, y: ys[i] ?? point.y },
  }))
}
