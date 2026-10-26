import { LABEL_GAP_X, endLabelAt, pointBefore } from './chartInteraction'
import type { AxisTick, ChartSize, PlotBox, Point } from './chartTypes'
import type { SharedWeek } from './gradeTrend'
import { labelSizePx, labelWidthPx, rootFontPx } from './rootFont'
import { linearScale, niceDomain, tickDecimals } from './scale'
import { formatValue, plotted } from './sharedTrendText'
import type { SharedMeasure } from './sharedTrendText'
import { NARROW_WIDTH, fitTicks } from './ticks'
import { trendDateTicks } from './trendTicks'

/** A value at the end of a line, labelled with its window, and where its label sits. */
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

/** A label's box reaches an em above its baseline and a quarter em below, as its ink does. */
const ASCENT_EM = 1
const DESCENT_EM = 0.25
/** The space a label's box keeps from the drawn band, so that the two do not touch. */
export const BAND_CLEAR_PX = 2

/** A rectangle on the chart, in px. */
interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

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
}

/** A label at a baseline: its plan, and the y it takes. */
interface Spot {
  plan: LabelPlan
  y: number
}

interface LabelRules {
  measure: SharedMeasure
  /** What follows the value, or null where the title already says it. */
  note: string | null
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
 * The ride band as stepBandPath draws it, in boxes: a stretch from each week's x to the next, which holds
 * the earlier week's range, and the two step connectors at the later week's x. A stretch is drawn only
 * where both of its weeks have a range, since stepBandPath breaks the band at a week without one.
 */
function bandBoxes(
  xs: readonly number[],
  upper: readonly (Point | null)[],
  lower: readonly (Point | null)[],
): Box[] {
  return xs.flatMap((left, i) => {
    const right = xs[i + 1]
    const high = upper[i] ?? null
    const low = lower[i] ?? null
    const nextHigh = upper[i + 1] ?? null
    const nextLow = lower[i + 1] ?? null
    if (right === undefined || !high || !low || !nextHigh || !nextLow) return []
    return [
      { left, right, top: high.y, bottom: low.y },
      {
        left: right,
        right,
        top: Math.min(high.y, nextHigh.y),
        bottom: Math.max(high.y, nextHigh.y),
      },
      { left: right, right, top: Math.min(low.y, nextLow.y), bottom: Math.max(low.y, nextLow.y) },
    ]
  })
}

/** The pieces of the band that an x-range meets. */
function stretchesUnder(band: readonly Box[], left: number, right: number): Box[] {
  return band.filter((stretch) => stretch.left <= right && stretch.right >= left)
}

/** Whether a box comes within pad px of any piece of the band. A box that only touches it at pad 0 does not. */
function meetsBand(box: Box, band: readonly Box[], pad: number): boolean {
  return band.some(
    (piece) =>
      piece.left - pad < box.right &&
      piece.right + pad > box.left &&
      piece.top - pad < box.bottom &&
      piece.bottom + pad > box.top,
  )
}

/**
 * The baselines that set a label's box just above, or just below, each edge of the band under it, at the
 * clearance the band keeps and at none. Each gap between neighbouring edges has its two ends here, so a
 * box that fits in a gap is among the spots.
 */
function bandSpots(under: readonly Box[], em: number): number[] {
  return under.flatMap((piece) =>
    [BAND_CLEAR_PX, 0].flatMap((clear) => [
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
 * The label at the latest value of one sport. Its preferred place is left of its point, and below it
 * unless the line arrives from below. Its other spots are the other side of its point, and the baselines
 * beside the band's edges under it, each kept inside the plot. Null when the sport has no value.
 */
function endLabel(
  kind: EndLabel['kind'],
  weeks: readonly SharedWeek[],
  points: readonly (Point | null)[],
  pick: (week: SharedWeek) => number | null,
  rules: LabelRules & { band: Box[] | null },
): LabelPlan | null {
  const latest = points.findLastIndex((point) => point !== null)
  const point = points[latest] ?? null
  const week = weeks[latest]
  const value = week === undefined ? null : pick(week)
  if (point === null || value === null) return null
  const shown = formatValue(rules.measure, value)
  const text = rules.note === null ? shown : `${shown}, ${rules.note}`
  const em = labelSizePx(rules.rootPx)
  const width = labelWidthPx(text, rules.rootPx)
  const { anchor, x } = sideOf(point, width, rules.plot)
  const preferred = endLabelAt(point, pointBefore(points, latest)).y
  // A line arriving from below puts the label above its point, so this stands in for that arrival.
  const other = endLabelAt(point, preferred > point.y ? { x: point.x, y: point.y + 1 } : null).y
  const left = anchor === 'end' ? x - width : x
  const under = rules.band === null ? [] : stretchesUnder(rules.band, left, left + width)
  const clamp = (y: number) => clampToSpan(y, rules.span)
  return {
    kind,
    text,
    anchor,
    x,
    width,
    em,
    preferredY: clamp(preferred),
    spots: [clamp(preferred), clamp(other), ...bandSpots(under, em).map(clamp)],
    band: rules.band,
  }
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

/** Whether a spot's box is inside the plot, both ways, and does not overlap the band its label keeps clear of. */
function fits(spot: Spot, plot: PlotBox): boolean {
  const box = boxOf(spot.plan, spot.y)
  return insidePlot(box, plot) && (spot.plan.band === null || !meetsBand(box, spot.plan.band, 0))
}

/** Whether a spot's box keeps BAND_CLEAR_PX from the band its label keeps clear of. */
function clearOfBand(spot: Spot): boolean {
  const { plan } = spot
  return plan.band === null || !meetsBand(boxOf(plan, spot.y), plan.band, BAND_CLEAR_PX)
}

/**
 * Where each label's baseline goes. Each combination of the labels' spots is spread apart, so the
 * positions that are checked are the final ones. A combination must keep every box inside the plot and
 * off the band. Of those, the one with fewest labels within BAND_CLEAR_PX of the band wins, and then the
 * one nearest the preferred places. Where no combination keeps every label off the band, the labels keep
 * their preferred places, spread apart and inside the plot.
 */
function placeLabels(plans: readonly LabelPlan[], plot: PlotBox, span: Span, gap: number): Spot[] {
  let best: { spots: Spot[]; near: number; cost: number } | null = null
  for (const picks of cartesian(plans.map((plan) => plan.spots.map((y) => ({ plan, y }))))) {
    const spots = spreadSpots(picks, gap, span)
    if (!spots.every((spot) => fits(spot, plot))) continue
    const near = spots.filter((spot) => !clearOfBand(spot)).length
    const cost = spots.reduce((sum, spot) => sum + Math.abs(spot.y - spot.plan.preferredY), 0)
    if (best === null || near < best.near || (near === best.near && cost < best.cost)) {
      best = { spots, near, cost }
    }
  }
  const preferred = plans.map((plan) => ({ plan, y: plan.preferredY }))
  return best?.spots ?? spreadSpots(preferred, gap, span)
}

/**
 * The drawn layout of a shared trend at a chart size: each sport's points and band, its end labels and
 * its axes. A narrow chart shows each end label's value alone, since its title names the effort and the
 * window. Null with fewer than two weeks, which is too few for a line.
 */
export function sharedTrendLayout(
  weeks: readonly SharedWeek[],
  measure: SharedMeasure,
  latestNote: string,
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
  const rootPx = rootFontPx()
  const em = labelSizePx(rootPx)
  const span = { lo: plot.top + ASCENT_EM * em, hi: plot.bottom - DESCENT_EM * em }
  const band = bandBoxes(xs, rideHigh, rideLow)
  const rules: LabelRules = {
    measure,
    note: width < NARROW_WIDTH ? null : latestNote,
    rootPx,
    plot,
    span,
  }
  const runLabel = endLabel('run', weeks, run, (week) => week.run, { ...rules, band })
  const rideLabel = endLabel('ride', weeks, ride, (week) => week.ride, { ...rules, band: null })
  const plans = [runLabel, rideLabel].flatMap((label) => (label === null ? [] : [label]))
  const spots = placeLabels(plans, plot, span, (ASCENT_EM + DESCENT_EM) * em)
  return {
    xs,
    run,
    ride,
    rideLow,
    rideHigh,
    ys: weeks.map((_, i) => (run[i] ?? ride[i])?.y ?? null),
    labels: spots.map(({ plan, y: at }) => ({
      kind: plan.kind,
      text: plan.text,
      anchor: plan.anchor,
      at: { x: plan.x, y: at },
    })),
    ...axisTicksOf(weeks, x, y, ticks, decimals, measure, width),
  }
}

/** The x and y axis ticks of a shared trend, each fitted to the chart's width. */
function axisTicksOf(
  weeks: readonly SharedWeek[],
  x: (value: number) => number,
  y: (value: number) => number,
  ticks: readonly number[],
  decimals: number,
  measure: SharedMeasure,
  width: number,
): { xTicks: AxisTick[]; yTicks: AxisTick[] } {
  return {
    xTicks: fitTicks(
      trendDateTicks(
        weeks.map((week) => week.endMs),
        x,
      ),
      { axis: 'x', width },
    ),
    yTicks: fitTicks(
      ticks.map((tick) => ({
        position: y(tick),
        label: measure === 'grade' ? `${tick.toFixed(decimals)}%` : tick.toFixed(decimals),
      })),
      { axis: 'y', width },
    ),
  }
}
