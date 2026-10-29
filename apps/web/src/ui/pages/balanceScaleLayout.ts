import { bandsIn, fitAxis, ticksIn, xAt } from './balanceScaleAxis'
import type { Axis } from './balanceScaleAxis'
import type { ScaleLane, ScaleModel } from './balanceScaleModel'
import {
  COMPACT,
  COMPACT_MAX_WIDTH,
  DESKTOP,
  PAD,
  placeGap,
  placeGhost,
  placeLane,
  textWidth,
} from './balanceScaleText'
import type {
  Anchor,
  BandBox,
  Context,
  GapBox,
  GhostBox,
  LaneBox,
  Mark,
  Metrics,
  Rect,
} from './balanceScaleText'

export { COMPACT_MAX_WIDTH, textWidth }
export type { Anchor, BandBox, GapBox, GhostBox, LaneBox, Rect, TextAt } from './balanceScaleText'

export interface ScaleLayout {
  width: number
  height: number
  compact: boolean
  metrics: Metrics
  axis: Axis
  plot: { left: number; right: number; top: number; bottom: number }
  bands: BandBox[]
  ticks: { percent: number; x: number; anchor: Anchor }[]
  lanes: LaneBox[]
  /** The bracket between the two marks: null when they sit on one grade, which has no span to bracket. */
  bracket: { x1: number; x2: number; y: number } | null
  /** The gap's figure and note; null for a lone lane, which has no gap to label. */
  gap: GapBox | null
  ghost: GhostBox | null
  /** Every box that holds text, so a test can check no two overlap. */
  boxes: Rect[]
}

/** The metrics for a width, with every size but the tick gap grown by the root font size's scale. */
function metricsFor(compact: boolean, scale: number): Metrics {
  return Object.fromEntries(
    Object.entries(compact ? COMPACT : DESKTOP).map(([key, value]) => [
      key,
      key === 'tickGap' ? value : value * scale,
    ]),
  ) as unknown as Metrics
}

/**
 * The level scale's drawing at a width: the fitted axis, the neutral level bands, each sport's mark in its
 * lane, the bracket for the gap between them, and the ghost ring for the level target, with every text placed
 * clear of the others. All of it follows from the model's whole percents and the width, so the same figures
 * always draw the same.
 */
export function scaleLayout(model: ScaleModel, width: number, rootPx = 16): ScaleLayout {
  const compact = width < COMPACT_MAX_WIDTH
  const m = metricsFor(compact, rootPx / 16)
  const axis = fitAxis([
    ...model.lanes.flatMap((lane) => [
      lane.centre,
      lane.low ?? lane.centre,
      lane.high ?? lane.centre,
    ]),
    ...(model.target === null ? [] : [model.target.at]),
  ])
  const xOf = (percent: number) => xAt(axis, 0, width, percent)
  const plot = { left: 0, right: width, top: m.plotTop, bottom: m.plotBottom }
  const bands: BandBox[] = bandsIn(axis).map((band) => {
    const x = xOf(band.from)
    const w = xOf(band.to) - x
    const fits = textWidth(band.name.toUpperCase(), m.labelFs, 'display') + PAD <= w * 1.05
    return {
      name: band.name,
      level: band.level,
      from: band.from,
      to: band.to,
      x,
      w,
      label: fits ? band.name : null,
    }
  })
  const ticks = ticksIn(axis).map((percent, index, all) => ({
    percent,
    x: xOf(percent),
    anchor: (index === 0 ? 'start' : index === all.length - 1 ? 'end' : 'middle') as Anchor,
  }))
  const marks: Mark[] = model.lanes.map((lane, index) => {
    const x = xOf(lane.centre)
    const band =
      lane.low === null || lane.high === null ? null : { x1: xOf(lane.low), x2: xOf(lane.high) }
    return {
      lane,
      index,
      kind: band === null ? 'dot' : 'ring',
      x,
      y: index === 0 ? m.topY : m.bottomY,
      band,
      reachLeft: (band?.x1 ?? x) - m.markR,
      reachRight: (band?.x2 ?? x) + m.markR,
    }
  })
  const boxes: Rect[] = []
  const cx: Context = { m, axis, plot, width, boxes, marks, compact }
  const leader = marks.reduce((best, mark) => (mark.lane.centre > best.lane.centre ? mark : best))
  const lo = marks.reduce((a, b) => (a.x < b.x ? a : b))
  const hi = marks.reduce((a, b) => (a.x > b.x ? a : b))

  // Lane names sit at each lane's left: the top one at the plot's top, the bottom one clear above its grade text.
  // A name is its glyph, the sport in capitals, and "recorded" or "estimated" at 0.7 of its size, with gaps.
  const nameW = (lane: ScaleLane) =>
    m.nameFs * 1.4 +
    textWidth(lane.sport.toUpperCase(), m.nameFs, 'display') +
    textWidth(lane.basis, m.nameFs * 0.7, 'body') +
    16
  const nameTops = marks.map((mark) => {
    const h = m.nameFs * 1.25
    const top = mark.index === 0 ? m.plotTop + 1 : mark.y - m.bigFs - h
    boxes.push({ x: PAD, y: top, w: nameW(mark.lane), h })
    return top
  })
  const gap = model.gap === null ? null : placeGap(model.gap, cx, lo, hi)
  const ghost = placeGhost(model, cx, leader)
  const lanes = marks.map((mark, index) => placeLane(mark, nameTops[index]!, cx, ghost))
  const lowest = lanes[lanes.length - 1]
  // A lone lane has no second lane, bracket or ghost to make room for, so its plot ends under its own marks.
  const base = marks.length === 1 ? m.topY + m.capH / 2 + m.smallFs * 2.5 : m.plotBottom
  const plotBottom = Math.max(base, lowest === undefined ? 0 : lowest.sub.y + m.smallFs * 1.2)
  return {
    width,
    height: plotBottom + m.tickGap + m.smallFs * 1.4,
    compact,
    metrics: m,
    axis,
    plot: { ...plot, bottom: plotBottom },
    bands,
    ticks,
    lanes,
    bracket: marks.length > 1 && hi.x - lo.x >= 6 ? { x1: lo.x, x2: hi.x, y: m.bracketY } : null,
    gap,
    ghost,
    boxes,
  }
}
