import type { Sport } from '@rca/core/types'
import type { BandSpan } from './balanceScaleAxis'

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
  /** The grade, set large; the small text (lines under a name, range ends, ticks); and the band names. */
  bigFs: number
  smallFs: number
  labelFs: number
  /** The lane names' size, which the names' boxes are laid out from. */
  nameFs: number
  markR: number
  bandH: number
  capH: number
  /** The room above the plot for the band names. */
  plotTop: number
  /** Between a lane's header and its mark, and between the lanes' marks where the connector runs. */
  headerGap: number
  barZone: number
  /** The room under the plot for the percentage labels. Not scaled with the root font size. */
  tickGap: number
}

export const DESKTOP: Metrics = {
  bigFs: 40,
  smallFs: 13,
  labelFs: 13,
  nameFs: 17,
  markR: 11,
  bandH: 16,
  capH: 24,
  plotTop: 28,
  headerGap: 8,
  barZone: 24,
  tickGap: 16,
}

export const COMPACT: Metrics = {
  bigFs: 28,
  smallFs: 11.5,
  labelFs: 11,
  nameFs: 14,
  markR: 8.5,
  bandH: 13,
  capH: 18,
  plotTop: 24,
  headerGap: 4,
  barZone: 14,
  tickGap: 14,
}

/** A plot narrower than this takes the compact metrics. */
export const COMPACT_MAX_WIDTH = 560
/** A glyph's average width in em, for the display face (condensed capitals and figures) and for the body face. */
const DISPLAY_EM = 0.5
const BODY_EM = 0.53
/** Space between two texts on a row, and between a text block and the plot's edge. */
export const GAP = 12
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

/** One printed end of an estimate's range, under its band. */
export interface RangeLabel extends TextAt {
  text: string
}

/** Which form of a lane's line under its name fits the row: the whole, without the effort's name, or the level alone. */
export type SubForm = 'full' | 'short' | 'level'

/** One lane: its mark, and the header that names it and gives its grade, above its mark or below it. */
export interface LaneBox {
  sport: Sport
  kind: 'dot' | 'ring'
  x: number
  y: number
  /** The pixel ends of an estimate's range band; null for a dot. */
  band: { x1: number; x2: number } | null
  /** The top left of the lane's name, icon beside it. */
  name: { x: number; y: number }
  /** The grade, large at the header's left, and the line under the name beside it. */
  pct: TextAt
  sub: TextAt
  subForm: SubForm
  /** An estimate's range ends under its band: one label each, or one for both where they would meet. */
  ranges: RangeLabel[]
}

/** The ghost ring for the level target, and the guide that joins it to the grade it matches. */
export interface GhostBox {
  x: number
  y: number
  guide: { x: number; y1: number; y2: number }
}

/** The connector between the two marks: a stem from each, joined by a bar at `y`. No text sits in it. */
export interface Connector {
  /** The upper mark's x and the lower's, in the order they are drawn. */
  x1: number
  x2: number
  /** The bar's y, and where each stem starts and ends: clear of its mark's ring. */
  y: number
  y1: number
  y2: number
}
