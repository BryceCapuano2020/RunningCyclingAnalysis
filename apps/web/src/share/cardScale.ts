import type { Sport } from '@rca/core/types'
import { bandsIn, fitAxis, ticksIn, xAt } from '../ui/pages/balanceScaleAxis'
import type { BandSpan } from '../ui/pages/balanceScaleAxis'
import type { ScaleGap, ScaleLane, ScaleModel } from '../ui/pages/balanceScaleModel'
import { SPORT_LABEL } from '../ui/sports'
import { CARD_COLORS } from './cardColors'
import {
  CONDENSED_700,
  CONDENSED_800,
  SANS_500,
  SANS_600,
  drawLines,
  drawPill,
  setFont,
  strokeWith,
  type CardContext,
  type TextStyle,
} from './cardCanvas'
import type { Block } from './cardLayout'

const BAND_NAME: TextStyle = { ...CONDENSED_700, size: 24, lineHeight: 28 }
const TICK: TextStyle = { ...SANS_500, size: 24, lineHeight: 28 }
const LANE_NAME: TextStyle = { ...CONDENSED_800, size: 28, lineHeight: 30 }
const BASIS: TextStyle = { ...SANS_500, size: 22, lineHeight: 26 }
const PCT: TextStyle = { ...CONDENSED_800, size: 54, lineHeight: 50 }
const LEVEL: TextStyle = { ...SANS_600, size: 24, lineHeight: 28 }
const GAP_FIGURE: TextStyle = { ...CONDENSED_800, size: 38, lineHeight: 36 }
const GAP_NOTE: TextStyle = { ...SANS_600, size: 24, lineHeight: 28 }

/** The rows of the drawing, from its top: band names, the plot with its two lanes and the bracket, the ticks. */
const PLOT_TOP = 40
const LANE_Y = [94, 218] as const
const BRACKET_Y = 156
const PLOT_BOTTOM = 266
const TICK_Y = PLOT_BOTTOM + 8
export const SCALE_HEIGHT = TICK_Y + TICK.lineHeight

const DOT_R = 16
const BAND_H = 28
const CAP_H = 40
/** The band is the sport's colour at this opacity, with a solid edge, so the range reads without its tint. */
const BAND_OPACITY = 0.4
const TEXT_GAP = 22
/** Between the gap's figure and its range caption. */
const GAP_NOTE_GAP = 14
/** A lane's grade sits this far above its line, and its level this far below; the block ends TEXT_BELOW under it. */
const TEXT_TOP = 34
const LEVEL_OFFSET = 12
const TEXT_BELOW = LEVEL_OFFSET + LEVEL.lineHeight + 2
const PAD = 10
/** The neutral level washes, from Recreational to World, copied from the dark tokens. */
const LEVEL_COLOURS = [
  CARD_COLORS.level1,
  CARD_COLORS.level2,
  CARD_COLORS.level3,
  CARD_COLORS.level4,
  CARD_COLORS.level5,
] as const

/** The scale the card draws: both sports' lanes, so it always has the gap between them. */
export type ShareScale = ScaleModel & { gap: ScaleGap }

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** One sport's mark and the text beside it, in canvas pixels. */
export interface CardLane {
  sport: Sport
  kind: 'dot' | 'ring'
  x: number
  y: number
  band: { x1: number; x2: number } | null
  /** The grade and level, set from `textX` with `align`, the grade's top at `pctY`. */
  textX: number
  align: 'left' | 'right'
  pctY: number
  levelY: number
}

export interface CardScaleGeometry {
  bands: (BandSpan & { x: number; w: number; named: boolean })[]
  ticks: { x: number; text: string }[]
  lanes: CardLane[]
  bracket: { x1: number; x2: number; y: number } | null
  /** The gap's figure at `x`, and its range caption after it where there is room; set from the left. */
  gap: { text: string; x: number; y: number; note: string | null; noteX: number }
  /** Every box that holds text, so a test can check no two overlap. */
  boxes: Rect[]
}

/** The width a line takes in a style; the card measures with the canvas, a test with this estimate. */
export type Measure = (text: string, style: TextStyle) => number

/** The top of a lane's name: above the lane's grade, clear of it. */
function nameTop(laneY: number): number {
  return laneY - TEXT_TOP - LANE_NAME.lineHeight - 2
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** The side of a mark a text block fits on, the preferred one first: inside the width and clear of the taken boxes; null if neither. */
function clearSide(
  block: { w: number; top: number; h: number },
  reach: { left: number; right: number },
  width: number,
  taken: readonly Rect[],
  prefer: 'right' | 'left',
): 'right' | 'left' | null {
  const box = (side: 'right' | 'left'): Rect => ({
    x: side === 'right' ? reach.right + TEXT_GAP : reach.left - TEXT_GAP - block.w,
    y: block.top,
    w: block.w,
    h: block.h,
  })
  const fits = (side: 'right' | 'left') => {
    const rect = box(side)
    return (
      rect.x >= PAD &&
      rect.x + rect.w <= width - PAD &&
      taken.every((other) => !overlaps(rect, other))
    )
  }
  const other = prefer === 'right' ? 'left' : 'right'
  const order: ('right' | 'left')[] = [prefer, other]
  return order.find(fits) ?? null
}

/** The side a block fits on, or the preferred side when neither is clear. */
function sideFor(
  block: { w: number; top: number; h: number },
  reach: { left: number; right: number },
  width: number,
  taken: readonly Rect[],
  prefer: 'right' | 'left',
): 'right' | 'left' {
  return clearSide(block, reach, width, taken, prefer) ?? prefer
}

/**
 * The card's level scale in canvas pixels at a width: the axis fitted to the data, the neutral bands, each
 * sport's dot or ring with its band, the gap's bracket and figure, and each lane's grade and level beside it.
 * It reads the page's own scale model, so every figure is the page's.
 */
export function cardScaleGeometry(
  scale: ShareScale,
  width: number,
  measure: Measure,
): CardScaleGeometry {
  const axis = fitAxis(
    scale.lanes.flatMap((lane) => [lane.centre, lane.low ?? lane.centre, lane.high ?? lane.centre]),
  )
  const xOf = (percent: number) => xAt(axis, 0, width, percent)
  const bands = bandsIn(axis).map((band) => {
    const x = xOf(band.from)
    const w = xOf(band.to) - x
    const named = measure(band.name.toUpperCase(), BAND_NAME) + PAD <= w
    return { name: band.name, level: band.level, from: band.from, to: band.to, x, w, named }
  })
  const ticks = ticksIn(axis).map((percent) => ({ x: xOf(percent), text: `${percent}%` }))
  const boxes: Rect[] = []

  const marks = scale.lanes.map((lane, index) => {
    const band =
      lane.low === null || lane.high === null ? null : { x1: xOf(lane.low), x2: xOf(lane.high) }
    const x = xOf(lane.centre)
    return { lane, index, x, y: LANE_Y[index] ?? LANE_Y[1], band }
  })
  // The lane names sit at each lane's left, above its line.
  for (const { lane, y } of marks) {
    const w = Math.max(
      measure(SPORT_LABEL[lane.sport].toUpperCase(), LANE_NAME) + 12 + measure(lane.basis, BASIS),
      0,
    )
    boxes.push({ x: PAD, y: nameTop(y), w, h: LANE_NAME.lineHeight })
  }
  const lo = marks.reduce((a, b) => (a.x < b.x ? a : b))
  const hi = marks.reduce((a, b) => (a.x > b.x ? a : b))
  const figureW = measure(scale.gap.figure.toUpperCase(), GAP_FIGURE)
  const gapTop = BRACKET_Y - GAP_FIGURE.lineHeight / 2
  const reachOfGap = { left: lo.x, right: hi.x }
  // The range caption sits beside the figure where the row has room: the longer wording first, then the
  // shorter; without room for either, the figure alone.
  const captioned = [scale.gap.noteShort, scale.gap.noteTiny]
    .map((note) => {
      const w = figureW + GAP_NOTE_GAP + measure(note, GAP_NOTE)
      const side = clearSide(
        { w, top: gapTop, h: GAP_FIGURE.lineHeight },
        reachOfGap,
        width,
        boxes,
        'right',
      )
      return { note, w, side }
    })
    .find((option) => option.side !== null)
  const gapW = captioned === undefined ? figureW : captioned.w
  const gapSide =
    captioned?.side ??
    sideFor(
      { w: figureW, top: gapTop, h: GAP_FIGURE.lineHeight },
      reachOfGap,
      width,
      boxes,
      'right',
    )
  const gapX = gapSide === 'right' ? hi.x + TEXT_GAP : lo.x - TEXT_GAP - gapW
  boxes.push({ x: gapX, y: gapTop, w: gapW, h: GAP_FIGURE.lineHeight })

  const lanes = marks.map(({ lane, index, x, y, band }): CardLane => {
    const w = Math.max(measure(lane.pct, PCT), measure(lane.level, LEVEL))
    const top = y - TEXT_TOP
    const h = TEXT_TOP + TEXT_BELOW
    const reach = { left: (band?.x1 ?? x) - DOT_R, right: (band?.x2 ?? x) + DOT_R }
    const side = sideFor({ w, top, h }, reach, width, boxes, index === 0 ? 'right' : 'left')
    boxes.push({
      x: side === 'right' ? reach.right + TEXT_GAP : reach.left - TEXT_GAP - w,
      y: top,
      w,
      h,
    })
    return {
      sport: lane.sport,
      kind: band === null ? 'dot' : 'ring',
      x,
      y,
      band,
      textX: side === 'right' ? reach.right + TEXT_GAP : reach.left - TEXT_GAP,
      align: side === 'right' ? 'left' : 'right',
      pctY: y - TEXT_TOP,
      levelY: y + LEVEL_OFFSET,
    }
  })
  return {
    bands,
    ticks,
    lanes,
    bracket: hi.x - lo.x >= 6 ? { x1: lo.x, x2: hi.x, y: BRACKET_Y } : null,
    gap: {
      text: scale.gap.figure.toUpperCase(),
      x: gapX,
      y: gapTop,
      note: captioned?.note ?? null,
      noteX: gapX + figureW + GAP_NOTE_GAP,
    },
    boxes,
  }
}

function colourOf(sport: Sport): string {
  return CARD_COLORS[sport]
}

function drawLane(
  ctx: CardContext,
  lane: CardLane,
  scaleLane: ScaleLane,
  at: { x: number; y: number },
): void {
  const colour = colourOf(lane.sport)
  const cx = at.x + lane.x
  const cy = at.y + lane.y
  if (lane.band !== null) {
    const width = Math.max(lane.band.x2 - lane.band.x1, BAND_H)
    ctx.globalAlpha = BAND_OPACITY
    drawPill(ctx, at.x + lane.band.x1, cy - BAND_H / 2, width, BAND_H, colour)
    ctx.globalAlpha = 1
    for (const x of [lane.band.x1, lane.band.x2]) {
      strokeWith(ctx, colour, 4, () => {
        ctx.moveTo(at.x + x, cy - CAP_H / 2)
        ctx.lineTo(at.x + x, cy + CAP_H / 2)
      })
    }
  }
  const circle = () => ctx.arc(cx, cy, DOT_R, 0, Math.PI * 2)
  ctx.beginPath()
  circle()
  // A recorded grade is a solid dot ringed in the card; an estimate is a hollow ring.
  ctx.fillStyle = lane.kind === 'dot' ? colour : CARD_COLORS.ink
  ctx.fill()
  strokeWith(
    ctx,
    lane.kind === 'dot' ? CARD_COLORS.ink : colour,
    lane.kind === 'dot' ? 5 : 7,
    circle,
  )
  ctx.textAlign = lane.align
  drawLines(ctx, [scaleLane.pct], at.x + lane.textX, at.y + lane.pctY, PCT, CARD_COLORS.text)
  drawLines(
    ctx,
    [scaleLane.level],
    at.x + lane.textX,
    at.y + lane.levelY,
    LEVEL,
    CARD_COLORS.secondary,
  )
  ctx.textAlign = 'left'
}

function drawBands(
  ctx: CardContext,
  geometry: CardScaleGeometry,
  at: { x: number; y: number },
): void {
  for (const band of geometry.bands) {
    ctx.fillStyle = LEVEL_COLOURS[band.level - 1] ?? LEVEL_COLOURS[0]
    ctx.fillRect(at.x + band.x, at.y + PLOT_TOP, Math.max(band.w - 2, 0), PLOT_BOTTOM - PLOT_TOP)
    if (band.named) {
      ctx.textAlign = 'center'
      drawLines(
        ctx,
        [band.name.toUpperCase()],
        at.x + band.x + band.w / 2,
        at.y,
        BAND_NAME,
        CARD_COLORS.secondary,
      )
    }
  }
  ctx.textAlign = 'left'
}

function drawScale(ctx: CardContext, scale: ShareScale, x: number, y: number, width: number): void {
  const measure: Measure = (text, style) => {
    setFont(ctx, style)
    return ctx.measureText(text).width
  }
  const geometry = cardScaleGeometry(scale, width, measure)
  const at = { x, y }
  drawBands(ctx, geometry, at)
  for (const lane of geometry.lanes) {
    ctx.fillStyle = CARD_COLORS.rule
    ctx.fillRect(x, y + lane.y - 1, width, 2)
  }
  if (geometry.bracket !== null) {
    const { x1, x2, y: by } = geometry.bracket
    strokeWith(ctx, CARD_COLORS.text, 3, () => {
      ctx.moveTo(x + x1, y + by - 14)
      ctx.lineTo(x + x1, y + by + 14)
      ctx.moveTo(x + x1, y + by)
      ctx.lineTo(x + x2, y + by)
      ctx.moveTo(x + x2, y + by - 14)
      ctx.lineTo(x + x2, y + by + 14)
    })
  }
  ctx.textAlign = 'left'
  drawLines(
    ctx,
    [geometry.gap.text],
    x + geometry.gap.x,
    y + geometry.gap.y,
    GAP_FIGURE,
    CARD_COLORS.text,
  )
  if (geometry.gap.note !== null) {
    const noteY = y + geometry.gap.y + (GAP_FIGURE.lineHeight - GAP_NOTE.lineHeight) / 2 + 4
    drawLines(
      ctx,
      [geometry.gap.note],
      x + geometry.gap.noteX,
      noteY,
      GAP_NOTE,
      CARD_COLORS.secondary,
    )
  }
  geometry.lanes.forEach((lane, index) => {
    const scaleLane = scale.lanes[index]
    if (scaleLane === undefined) return
    drawLane(ctx, lane, scaleLane, at)
    const name = SPORT_LABEL[lane.sport].toUpperCase()
    const nameY = y + nameTop(lane.y)
    drawLines(ctx, [name], x + PAD, nameY, LANE_NAME, CARD_COLORS.text)
    drawLines(
      ctx,
      [scaleLane.basis],
      x + PAD + measure(name, LANE_NAME) + 12,
      nameY + 2,
      BASIS,
      CARD_COLORS.secondary,
    )
  })
  geometry.ticks.forEach((tick, index) => {
    // The ends of the axis are set inward from their edge, so neither label is cut off.
    ctx.textAlign = index === 0 ? 'left' : index === geometry.ticks.length - 1 ? 'right' : 'center'
    drawLines(ctx, [tick.text], x + tick.x, y + TICK_Y, TICK, CARD_COLORS.muted)
  })
  ctx.textAlign = 'left'
}

/** The level scale across the content width, at the given x: the card's visual, in place of the meter. */
export function scaleBlock(ctx: CardContext, scale: ShareScale, x: number, width: number): Block {
  return { height: SCALE_HEIGHT, draw: (y) => drawScale(ctx, scale, x, y, width) }
}
