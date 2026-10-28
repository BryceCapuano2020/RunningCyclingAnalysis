import { LABEL_GAP_X, endLabelAt, markerRadii, pointBefore, spreadApart } from './chartInteraction'
import {
  ASCENT_EM,
  DESCENT_EM,
  bandBoxes,
  meetsBoxes,
  stepBoxes,
  stretchesUnder,
} from './chartBoxes'
import type { Box } from './chartBoxes'
import { SPORT_LABEL } from '../sports'
import type { AxisTick, ChartSize, PlotBox, Point } from './chartTypes'
import type { SharedWeek } from './gradeTrend'
import { labelSizePx, labelWidthPx, rootFontPx } from './rootFont'
import { linearScale, niceDomain, tickDecimals } from './scale'
import { PLOT_MARGIN } from './plotBox'
import { NARROW_WIDTH } from './ticks'
import { formatValue, plotted } from './sharedTrendText'
import type { SharedMeasure } from './sharedTrendText'
import { axisTicksOf } from './sharedTrendAxes'

/** A value at the end of a line, labelled with its sport and value, such as "Run 64%", and where that label sits. */
export interface EndLabel {
  kind: 'run' | 'ride'
  text: string
  /** Start sets the text to the right of its point, where its left side would cross the plot's left edge. */
  anchor: 'start' | 'end'
  at: Point
}

export interface SharedLayout {
  xs: number[]
  run: (Point | null)[]
  ride: (Point | null)[]
  rideLow: (Point | null)[]
  rideHigh: (Point | null)[]
  /** Where each week's tooltip is anchored: beside its first point. */
  ys: (number | null)[]
  labels: EndLabel[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

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

/** The space a label's box keeps from the drawn band, so that the two do not touch. */
export const BAND_CLEAR_PX = 2
/** The space a run label's box keeps from the run's own line and markers, where it can. */
const LINE_CLEAR_PX = 4
/**
 * How far, in ems, a label's baseline may move from its own point to keep clear of the band or the line.
 * A label further from its point reads as the label of whatever line is beside it, so past this reach
 * the label stays beside its point, over the band, which its halo keeps legible.
 */
export const LABEL_REACH_EM = 4

/** The baselines that keep a label's box inside the plot's top and bottom. */
interface Span {
  lo: number
  hi: number
}

/** A label before its place: its text and anchor, its point, and the baselines it may take. */
interface LabelPlan {
  kind: EndLabel['kind']
  text: string
  anchor: EndLabel['anchor']
  /** Where the text is set: its right edge for an end anchor, its left edge for a start anchor. */
  x: number
  /** The text's width and the label's em, in px, which size its box. */
  width: number
  em: number
  /** The baseline it takes when nothing is in its way. */
  preferredY: number
  /** Every baseline it may take, the preferred first. */
  spots: number[]
  /** The drawn band it must keep clear of, or null for a label with none. */
  band: Box[] | null
  /** The drawn line and markers of its own sport it must keep clear of, or null for none. */
  line: Box[] | null
}

/** A label at a baseline: its plan, and the y it takes. */
interface Spot {
  plan: LabelPlan
  y: number
}

interface LabelRules {
  measure: SharedMeasure
  rootPx: number
  plot: PlotBox
  span: Span
}

/** The box a label takes at a baseline. */
function boxOf(plan: LabelPlan, y: number): Box {
  const left = plan.anchor === 'end' ? plan.x - plan.width : plan.x
  return {
    left,
    right: left + plan.width,
    top: y - ASCENT_EM * plan.em,
    bottom: y + DESCENT_EM * plan.em,
  }
}

function insidePlot(box: Box, plot: PlotBox): boolean {
  return (
    box.left >= plot.left &&
    box.right <= plot.right &&
    box.top >= plot.top &&
    box.bottom <= plot.bottom
  )
}

/** Keeps v between lo and hi, or at lo where the range is empty, as where a label is wider than the plot. */
function keepBetween(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), Math.max(lo, hi))
}

/** Keeps a baseline inside the span. A span too short to hold a label centres it on the plot instead. */
function clampToSpan(y: number, span: Span): number {
  return span.hi < span.lo ? (span.lo + span.hi) / 2 : keepBetween(y, span.lo, span.hi)
}

/**
 * The baselines that set a label's box just above, or just below, each edge of the drawn pieces under it,
 * at the clearance they keep and at none. Each gap between neighbouring edges has its two ends here, so a
 * box that fits in a gap is among the spots.
 */
function edgeSpots(under: readonly Box[], em: number, clearance: number): number[] {
  return under.flatMap((piece) =>
    [clearance, 0].flatMap((clear) => [
      piece.top - clear - DESCENT_EM * em,
      piece.bottom + clear + ASCENT_EM * em,
    ]),
  )
}

/**
 * Where a label's text is set beside its point: to the point's left, unless its box would cross the
 * plot's left edge, then to its right. Either way the box is then moved inside the plot's left and right
 * edges, which can bring it against its point or over it where the plot is too narrow beside the point.
 */
function sideOf(
  point: Point,
  width: number,
  plot: PlotBox,
): { anchor: EndLabel['anchor']; x: number } {
  if (point.x - LABEL_GAP_X - width >= plot.left) return { anchor: 'end', x: point.x - LABEL_GAP_X }
  return { anchor: 'start', x: keepBetween(point.x + LABEL_GAP_X, plot.left, plot.right - width) }
}

/**
 * The label at the latest value of one sport, named by its sport and its value, such as "Run 64%". Its
 * preferred place is left of its point, and below it unless the line arrives from below. Its other spots
 * are the other side of its point, and the baselines beside the band's edges and the line's under it that
 * lie within LABEL_REACH_EM of the point, each kept inside the plot. Null when the sport has no value.
 */
function endLabel(
  kind: EndLabel['kind'],
  weeks: readonly SharedWeek[],
  points: readonly (Point | null)[],
  pick: (week: SharedWeek) => number | null,
  rules: LabelRules & Pick<LabelPlan, 'band' | 'line'>,
): LabelPlan | null {
  const latest = points.findLastIndex((point) => point !== null)
  const point = points[latest] ?? null
  const week = weeks[latest]
  const value = week === undefined ? null : pick(week)
  if (point === null || value === null) return null
  const text = `${SPORT_LABEL[kind]} ${formatValue(rules.measure, value)}`
  const em = labelSizePx(rules.rootPx)
  const width = labelWidthPx(text, rules.rootPx)
  const { anchor, x } = sideOf(point, width, rules.plot)
  const preferred = endLabelAt(point, pointBefore(points, latest)).y
  // A line arriving from below puts the label above its point, so this stands in for that arrival.
  const other = endLabelAt(point, preferred > point.y ? { x: point.x, y: point.y + 1 } : null).y
  const left = anchor === 'end' ? x - width : x
  const underBand = rules.band === null ? [] : stretchesUnder(rules.band, left, left + width)
  const underLine = rules.line === null ? [] : stretchesUnder(rules.line, left, left + width)
  const clamp = (y: number) => clampToSpan(y, rules.span)
  return {
    kind,
    text,
    anchor,
    x,
    width,
    em,
    preferredY: clamp(preferred),
    spots: [
      clamp(preferred),
      clamp(other),
      ...[...edgeSpots(underBand, em, BAND_CLEAR_PX), ...edgeSpots(underLine, em, LINE_CLEAR_PX)]
        .map(clamp)
        .filter((y) => Math.abs(y - point.y) <= LABEL_REACH_EM * em),
    ],
    band: rules.band,
    line: rules.line,
  }
}

/** Whether counts a are fewer than counts b, comparing the first count, then the next. */
function nearer(a: readonly number[], b: readonly number[]): boolean {
  const first = a.findIndex((count, i) => count !== b[i])
  return first !== -1 && (a[first] ?? 0) < (b[first] ?? 0)
}

function sameNear(a: readonly number[], b: readonly number[]): boolean {
  return a.every((count, i) => count === b[i])
}

/** Every way to take one item from each list, in the order of the lists. */
function cartesian<T>(lists: readonly (readonly T[])[]): T[][] {
  return lists.reduce<T[][]>(
    (combos, list) => combos.flatMap((combo) => list.map((item) => [...combo, item])),
    [[]],
  )
}

/**
 * Spreads spots apart, in order of y, so that each sits at least gap below the one above it. A run that
 * would pass the span's bottom is packed back up from it. Where the span cannot hold them all, the packed
 * spots are clamped into it, so they stay inside the plot though they may then overlap. Returns the spots
 * in their input order.
 */
function spreadSpots(spots: readonly Spot[], gap: number, span: Span): Spot[] {
  const placed = spots.map((spot) => ({ ...spot }))
  const order = [...placed].sort((a, b) => a.y - b.y)
  let floor = span.lo
  for (const spot of order) {
    spot.y = Math.max(spot.y, floor)
    floor = spot.y + gap
  }
  let ceiling = span.hi
  for (const spot of [...order].reverse()) {
    spot.y = Math.min(spot.y, ceiling)
    ceiling = spot.y - gap
  }
  for (const spot of placed) spot.y = clampToSpan(spot.y, span)
  return placed
}

/** Whether a spot's box is inside the plot, both ways, and touches neither drawn piece its label keeps clear of. */
function fits(spot: Spot, plot: PlotBox): boolean {
  const box = boxOf(spot.plan, spot.y)
  return insidePlot(box, plot) && !overlapsDrawn(box, spot.plan, 0)
}

/** Whether a box comes within pad px of a drawn piece its label keeps clear of, the band or the line. */
function overlapsDrawn(box: Box, plan: LabelPlan, pad: number): boolean {
  return (
    (plan.band !== null && meetsBoxes(box, plan.band, pad)) ||
    (plan.line !== null && meetsBoxes(box, plan.line, pad))
  )
}

/** Whether a spot's box keeps BAND_CLEAR_PX from the band its label keeps clear of. */
function clearOfBand(spot: Spot): boolean {
  const { plan } = spot
  return plan.band === null || !meetsBoxes(boxOf(plan, spot.y), plan.band, BAND_CLEAR_PX)
}

/** Whether a spot's box keeps LINE_CLEAR_PX from the run's own line and markers, which its label keeps clear of. */
function clearOfLine(spot: Spot): boolean {
  const { plan } = spot
  return plan.line === null || !meetsBoxes(boxOf(plan, spot.y), plan.line, LINE_CLEAR_PX)
}

/**
 * Where each label's baseline goes. Each combination of the labels' spots is spread apart, so the
 * positions that are checked are the final ones. A combination must keep every box inside the plot and
 * off the drawn band and line. Of those, the one with fewest labels within BAND_CLEAR_PX of the band wins,
 * then the fewest within LINE_CLEAR_PX of the line, then the one nearest the preferred places. Where no
 * combination keeps every label off the drawn pieces, the labels keep their preferred places, spread apart
 * and inside the plot.
 */
function placeLabels(plans: readonly LabelPlan[], plot: PlotBox, span: Span, gap: number): Spot[] {
  let best: { spots: Spot[]; near: number[]; cost: number } | null = null
  for (const picks of cartesian(plans.map((plan) => plan.spots.map((y) => ({ plan, y }))))) {
    const spots = spreadSpots(picks, gap, span)
    if (!spots.every((spot) => fits(spot, plot))) continue
    const near = [
      spots.filter((spot) => !clearOfBand(spot)).length,
      spots.filter((spot) => !clearOfLine(spot)).length,
    ]
    const cost = spots.reduce((sum, spot) => sum + Math.abs(spot.y - spot.plan.preferredY), 0)
    if (
      best === null ||
      nearer(near, best.near) ||
      (sameNear(near, best.near) && cost < best.cost)
    ) {
      best = { spots, near, cost }
    }
  }
  const preferred = plans.map((plan) => ({ plan, y: plan.preferredY }))
  return best?.spots ?? spreadSpots(preferred, gap, span)
}

/**
 * The drawn layout of a shared trend at a chart size: each sport's points and band, its end labels and
 * its axes. Each end label names its sport and value, such as "Run 64%", at every width. Null with fewer
 * than two weeks, which is too few for a line.
 */
export function sharedTrendLayout(
  weeks: readonly SharedWeek[],
  measure: SharedMeasure,
  size: ChartSize,
): SharedLayout | null {
  const first = weeks[0]
  const last = weeks.at(-1)
  if (weeks.length < 2 || first === undefined || last === undefined) return null
  const { plot, width } = size
  const x = linearScale([first.endMs, last.endMs], [plot.left, plot.right])
  const values = weeks
    .flatMap((week) => [week.run, week.ride, week.rideLow, week.rideHigh])
    .filter((value): value is number => value !== null)
    .map((value) => plotted(measure, value))
  const { domain, ticks } = niceDomain(values, 4, 0.05)
  const decimals = tickDecimals(ticks)
  const y = linearScale(domain, [plot.bottom, plot.top])
  const pointsOf = (pick: (week: SharedWeek) => number | null): (Point | null)[] =>
    weeks.map((week) => {
      const value = pick(week)
      return value === null ? null : { x: x(week.endMs), y: y(plotted(measure, value)) }
    })
  const xs = weeks.map((week) => x(week.endMs))
  const run = pointsOf((week) => week.run)
  const ride = pointsOf((week) => week.ride)
  const rideLow = pointsOf((week) => week.rideLow)
  const rideHigh = pointsOf((week) => week.rideHigh)
  return {
    xs,
    run,
    ride,
    rideLow,
    rideHigh,
    ys: weeks.map((_, i) => (run[i] ?? ride[i])?.y ?? null),
    labels: labelsOf(weeks, { run, ride, xs, rideHigh, rideLow }, measure, size),
    ...axisTicksOf(weeks, x, y, ticks, decimals, measure, width),
  }
}

/** The drawn points of a shared trend: each sport's values, and the ride's range, at each week's x. */
interface Drawn {
  run: (Point | null)[]
  ride: (Point | null)[]
  xs: number[]
  rideHigh: (Point | null)[]
  rideLow: (Point | null)[]
}

/**
 * The end labels of a shared trend, each at a baseline that keeps it inside the plot and clear of both
 * lines and, for the run's, the ride band. A label is named by its sport and value, so the title needs no window.
 */
function labelsOf(
  weeks: readonly SharedWeek[],
  drawn: Drawn,
  measure: SharedMeasure,
  size: ChartSize,
): EndLabel[] {
  const { plot, width } = size
  const rootPx = rootFontPx()
  const em = labelSizePx(rootPx)
  const span = { lo: plot.top + ASCENT_EM * em, hi: plot.bottom - DESCENT_EM * em }
  const rules: LabelRules = { measure, rootPx, plot, span }
  const beside = gutterLabels(weeks, drawn, measure, size, span)
  if (beside !== null) return beside
  // Each label keeps clear of both lines and their markers, not only its own sport's: a label set over the
  // other sport's markers reads as that sport's.
  const markerR = markerRadii(width).active
  const lines = [...stepBoxes(drawn.run, markerR), ...stepBoxes(drawn.ride, markerR)]
  const runLabel = endLabel('run', weeks, drawn.run, (week) => week.run, {
    ...rules,
    band: bandBoxes(drawn.xs, drawn.rideHigh, drawn.rideLow),
    line: lines,
  })
  const rideLabel = endLabel('ride', weeks, drawn.ride, (week) => week.ride, {
    ...rules,
    band: null,
    line: lines,
  })
  const plans = [runLabel, rideLabel].flatMap((label) => (label === null ? [] : [label]))
  return placeLabels(plans, plot, span, (ASCENT_EM + DESCENT_EM) * em).map(({ plan, y }) => ({
    kind: plan.kind,
    text: plan.text,
    anchor: plan.anchor,
    at: { x: plan.x, y },
  }))
}

/**
 * The end labels in the gutter right of a wide plot, each level with its line's last point and spread
 * apart where the two points are close. Null when the plot leaves no gutter wide enough, or when a line ends before the
 * plot's right edge, where a label beside its end would lie over the plot: the labels are then placed
 * over the plot, clear of the lines.
 */
function gutterLabels(
  weeks: readonly SharedWeek[],
  drawn: Drawn,
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
    at: { x: point.x + LABEL_GAP_X, y: keepBetween(ys[i] ?? point.y, span.lo, span.hi) },
  }))
}
