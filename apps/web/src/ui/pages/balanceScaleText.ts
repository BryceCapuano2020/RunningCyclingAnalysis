import type { Sport } from '@rca/core/types'
import { xAt } from './balanceScaleAxis'
import type { Axis, BandSpan } from './balanceScaleAxis'
import type { ScaleGap, ScaleLane, ScaleModel } from './balanceScaleModel'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type Anchor = 'start' | 'middle' | 'end'

/** Where a line of text sits: its anchor point on the baseline, and which edge that point is. */
export interface TextAt {
  x: number
  y: number
  anchor: Anchor
}

/** The sizes one width of the drawing is laid out at, in px, before the root font size scales them. */
export interface Metrics {
  /** Display figures (the grade), the gap's figure, body labels, and the band names. */
  bigFs: number
  midFs: number
  smallFs: number
  labelFs: number
  /** The lane names' size, which the names' boxes are laid out from. */
  nameFs: number
  markR: number
  bandH: number
  capH: number
  plotTop: number
  topY: number
  bracketY: number
  bottomY: number
  plotBottom: number
  /** The room under the plot for the percentage labels. Not scaled with the root font size. */
  tickGap: number
}

export const DESKTOP: Metrics = {
  bigFs: 44,
  midFs: 30,
  smallFs: 13,
  labelFs: 13,
  nameFs: 18,
  markR: 12,
  bandH: 18,
  capH: 26,
  plotTop: 34,
  topY: 90,
  bracketY: 136,
  bottomY: 200,
  plotBottom: 254,
  tickGap: 18,
}

export const COMPACT: Metrics = {
  bigFs: 34,
  midFs: 24,
  smallFs: 11.5,
  labelFs: 11,
  nameFs: 14,
  markR: 9,
  bandH: 14,
  capH: 22,
  plotTop: 30,
  topY: 82,
  bracketY: 117,
  bottomY: 162,
  plotBottom: 208,
  tickGap: 18,
}

/** A plot narrower than this takes the compact metrics. */
export const COMPACT_MAX_WIDTH = 560
/** A glyph's average width in em, for the display face (condensed capitals and figures) and for the body face. */
const DISPLAY_EM = 0.5
const BODY_EM = 0.56
/** Space between a mark and the text beside it, and between a text block and the plot's edge. */
export const GAP = 14
export const PAD = 8

/** The width a line of text takes at a font size, estimated from its length; layout keeps a margin for the error. */
export function textWidth(text: string, fontSize: number, face: 'display' | 'body'): number {
  return text.length * fontSize * (face === 'display' ? DISPLAY_EM : BODY_EM)
}

/** One level band as drawn: its box, and its name when the box is wide enough to hold it. */
export interface BandBox extends BandSpan {
  x: number
  w: number
  label: string | null
}

/** One lane's mark: a dot for a recorded grade, or a ring over a band for an estimate. */
export interface LaneBox {
  sport: Sport
  kind: 'dot' | 'ring'
  x: number
  y: number
  /** The pixel ends of an estimate's range band; null for a dot. */
  band: { x1: number; x2: number } | null
  /** The top left of the lane's name, icon beside it, at the lane's left. */
  name: { x: number; y: number }
  /** The grade and the line under it: beside the mark, or under the band when neither side has room. */
  pct: TextAt
  sub: TextAt
  /** The range's two ends under the band, for an estimate. */
  rangeLow: TextAt | null
  rangeHigh: TextAt | null
  /** Whether the sub line is the short form, because the full one would not fit its place. */
  short: boolean
}

/** The gap's figure and note: on one line, or the note under the figure when the line would not fit. */
export interface GapBox {
  figure: TextAt
  /** The note and its words; null where only the figure fits clear of the other text, and the page says the range above. */
  note: TextAt | null
  figureSize: number
  noteText: string | null
}

/** The ghost ring for the level target, and the guide that joins it to the grade it matches. */
export interface GhostBox {
  x: number
  y: number
  guide: { x: number; y1: number; y2: number }
  /** The label beside the ring; null when no side has room, and the page says it under the drawing. */
  label: { eyebrow: TextAt; line: TextAt } | null
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}

/** A side of a mark a block of text can sit on: where it starts or ends, and whether it fits there. */
interface Side {
  x: number
  anchor: Anchor
  fits: boolean
}

/** What every placement shares: the sizes, the axis, the plot, the boxes taken so far, and the marks. */
export interface Context {
  m: Metrics
  axis: Axis
  plot: { left: number; right: number }
  width: number
  boxes: Rect[]
  marks: Mark[]
  compact: boolean
}

/** One lane's mark and the pixels its ring and band take, for text to keep clear of. */
export interface Mark {
  lane: ScaleLane
  index: number
  kind: 'dot' | 'ring'
  x: number
  y: number
  band: { x1: number; x2: number } | null
  reachLeft: number
  reachRight: number
}

/**
 * Where a block of text goes beside a mark: to its right, else to its left, taking the first side that is
 * inside the plot and clear of every box taken; the preferred side, marked as not fitting, if neither is.
 */
function beside(
  want: { w: number; top: number; h: number },
  at: { right: number; left: number },
  cx: Pick<Context, 'plot' | 'boxes'>,
  prefer: 'right' | 'left',
): Side {
  const right = { x: at.right, anchor: 'start' as const }
  const left = { x: at.left, anchor: 'end' as const }
  const fits = (side: { x: number; anchor: Anchor }): boolean => {
    const x = side.anchor === 'start' ? side.x : side.x - want.w
    const box: Rect = { x, y: want.top, w: want.w, h: want.h }
    const inside = x >= cx.plot.left && x + want.w <= cx.plot.right
    return inside && cx.boxes.every((other) => !overlaps(box, other))
  }
  const order = prefer === 'right' ? [right, left] : [left, right]
  const found = order.find(fits)
  return { ...(found ?? order[0]!), fits: found !== undefined }
}

/** The left edge of a block placed on a side. */
function startOf(side: Side, w: number): number {
  return side.anchor === 'start' ? side.x : side.x - w
}

/**
 * The gap's label: inline on the bracket's right or left, else its note under the figure, else the figure alone,
 * which the scoreboard's own note above the drawing says the range for. The last resort is held inside the plot.
 */
export function placeGap(gap: ScaleGap, cx: Context, lo: Mark, hi: Mark): GapBox {
  const { m, boxes } = cx
  const figureW = textWidth(gap.figure.toUpperCase(), m.midFs, 'display')
  const top = m.bracketY - m.midFs * 0.5
  const at = { right: hi.x + GAP, left: lo.x - GAP }
  const notes = [gap.note, gap.noteShort, gap.noteTiny]
  const noteW = (note: string) => textWidth(note, m.smallFs, 'body')
  // Where a figure's baseline sits in a box that starts at `top`: the capitals fill most of the size.
  const stackedFigureY = top + m.midFs * 0.8
  const layouts = [
    ...notes.map((note) => ({ note, stack: false, w: figureW + 8 + noteW(note), h: m.midFs })),
    ...notes.map((note) => ({
      note,
      stack: true,
      w: Math.max(figureW, noteW(note)),
      h: m.midFs + m.smallFs * 1.6,
    })),
    { note: null, stack: false, w: figureW, h: m.midFs },
  ]
  for (const { note, stack, w, h } of layouts) {
    const side = beside({ w, top, h }, at, cx, 'right')
    if (!side.fits) continue
    const x = startOf(side, w)
    boxes.push({ x, y: top, w, h })
    return {
      figure: { x, y: stack ? stackedFigureY : m.bracketY + m.midFs * 0.36, anchor: 'start' },
      note:
        note === null
          ? null
          : stack
            ? { x, y: stackedFigureY + m.smallFs * 1.5, anchor: 'start' }
            : { x: x + figureW + 8, y: m.bracketY + m.midFs * 0.2, anchor: 'start' },
      figureSize: m.midFs,
      noteText: note,
    }
  }
  const x = Math.min(hi.x + GAP, cx.width - PAD - figureW)
  boxes.push({ x, y: top, w: figureW, h: m.midFs })
  return {
    figure: { x, y: m.bracketY + m.midFs * 0.36, anchor: 'start' },
    note: null,
    figureSize: m.midFs,
    noteText: null,
  }
}

/** The ghost ring in the lower sport's lane at the higher sport's grade, with its label if a side has room. */
export function placeGhost(model: ScaleModel, cx: Context, leader: Mark): GhostBox | null {
  const { m, boxes, width } = cx
  const target = model.target
  const lower =
    target === null ? undefined : cx.marks.find((mark) => mark.lane.sport === target.sport)
  if (target === null || lower === undefined || lower === leader) return null
  const x = xAt(cx.axis, 0, width, target.at)
  const y = lower.y
  const towards = leader.y < y ? -1 : 1
  const guide = { x, y1: leader.y - towards * (m.markR + 2), y2: y + towards * (m.markR + 2) }
  const w = Math.max(
    textWidth(target.eyebrow.toUpperCase(), m.smallFs, 'display') + 8,
    textWidth(target.line, m.smallFs, 'body'),
  )
  const top = y - m.smallFs * 1.5
  const h = m.smallFs * 3.1
  // The label keeps clear of the lane's own ring and band, which can run past the ghost.
  const right = Math.max(x + m.markR + GAP, lower.reachRight > x ? lower.reachRight + GAP : 0)
  const left = Math.min(x - m.markR - GAP, lower.reachLeft < x ? lower.reachLeft - GAP : width)
  const side = beside({ w, top, h }, { right, left }, cx, 'right')
  if (!side.fits) return { x, y, guide, label: null }
  boxes.push({ x: startOf(side, w), y: top, w, h })
  return {
    x,
    y,
    guide,
    label: {
      eyebrow: { x: side.x, y: y - m.smallFs * 0.4, anchor: side.anchor },
      line: { x: side.x, y: y + m.smallFs * 1.1, anchor: side.anchor },
    },
  }
}

/**
 * A lane's grade text: beside the mark on the side away from the ghost, or, for the bottom lane when neither
 * side has room, under its band and centred on it.
 */
export function placeLane(
  mark: Mark,
  nameTop: number,
  cx: Context,
  ghost: GhostBox | null,
): LaneBox {
  const { m, boxes, compact, width } = cx
  const { lane } = mark
  const bigW = textWidth(lane.pct, m.bigFs, 'display')
  const rangeY = mark.y + m.capH / 2 + m.smallFs + 6
  const common = {
    sport: lane.sport,
    kind: mark.kind,
    x: mark.x,
    y: mark.y,
    band: mark.band,
    name: { x: PAD, y: nameTop },
    rangeLow: mark.band === null ? null : { x: mark.band.x1, y: rangeY, anchor: 'middle' as const },
    rangeHigh:
      mark.band === null ? null : { x: mark.band.x2, y: rangeY, anchor: 'middle' as const },
  }
  const away = ghost !== null && ghost.y === mark.y && ghost.x > mark.x ? 'left' : 'right'
  const top = mark.y - m.bigFs * 0.95
  const h = m.bigFs * 0.95 + m.smallFs * 2
  const place = (short: boolean) => {
    const w = Math.max(bigW, textWidth(short ? lane.subShort : lane.sub, m.smallFs, 'body'))
    const at = { right: mark.reachRight + GAP, left: mark.reachLeft - GAP }
    return { w, short, side: beside({ w, top, h }, at, cx, away) }
  }
  const full = place(compact)
  const chosen = full.side.fits || compact ? full : place(true)
  if (mark.index === 0 || chosen.side.fits) {
    // The top lane's text stays inside the plot even where no side is clear of the other text.
    const left = chosen.side.fits
      ? startOf(chosen.side, chosen.w)
      : clamp(startOf(chosen.side, chosen.w), PAD, width - PAD - chosen.w)
    const side = {
      x: chosen.side.anchor === 'start' ? left : left + chosen.w,
      anchor: chosen.side.anchor,
    }
    boxes.push({ x: left, y: top, w: chosen.w, h })
    return {
      ...common,
      pct: { x: side.x, y: mark.y - m.smallFs * 0.6, anchor: side.anchor },
      sub: { x: side.x, y: mark.y + m.smallFs * 1.9, anchor: side.anchor },
      short: chosen.short,
    }
  }
  const short = compact && textWidth(lane.sub, m.smallFs, 'body') > width - 2 * PAD
  const w = Math.max(bigW, textWidth(short ? lane.subShort : lane.sub, m.smallFs, 'body'))
  const centre = clamp(mark.x, PAD + w / 2, width - PAD - w / 2)
  const pctY = rangeY + m.bigFs * 0.95 + 8
  boxes.push({ x: centre - w / 2, y: pctY - m.bigFs * 0.8, w, h: m.bigFs * 0.8 + m.smallFs * 2.2 })
  return {
    ...common,
    pct: { x: centre, y: pctY, anchor: 'middle' },
    sub: { x: centre, y: pctY + m.smallFs * 1.7, anchor: 'middle' },
    short,
  }
}
