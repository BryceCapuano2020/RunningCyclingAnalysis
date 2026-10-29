import type { Box } from './chartBoxes'
import type { PlotBox, Point } from './chartTypes'
import { DEFAULT_ROOT_PX, GLYPH_EM, LABEL_PAD_EM, LABEL_REM } from './rootFont'

/**
 * The annotation primitive: the marks that say what a chart found. An end label names a series where it
 * stops, a callout marks an extreme or a best with its value at display size and a leader line, a
 * reference line carries a label (a threshold), and a bracket spans a stretch of the x axis. This file
 * is the layout: pure maths from where the marks belong to where their text can sit without covering one
 * another or the data. ChartAnnotations draws what it places.
 */

export type AnnotationTone = 'run' | 'ride' | 'neutral'

interface Mark {
  /** Stable name: the key of its elements, and what a test finds it by. */
  id: string
  tone?: AnnotationTone
  /** Left out, rather than drawn over another mark, where it finds no clear place. The value is still in the tooltip and the table. */
  optional?: boolean
}

/** A series' name or value at its last point, to the right of it where the margin has room. */
export interface EndLabel extends Mark {
  kind: 'end'
  at: Point
  text: string
  /** A smaller second line, such as where the series ends. */
  sub?: string
}

/** A marked point: an eyebrow, its value at display size, a caption, and a leader line to the point. */
export interface Callout extends Mark {
  kind: 'callout'
  at: Point
  /** Number and unit, such as "5:47 /mi": the unit is set smaller after the first space. */
  value: string
  /** The eyebrow over the value, such as "5 min". */
  label?: string
  caption?: string
  /** Which side of the point its text sits on first. Above when omitted. */
  prefer?: 'above' | 'below'
}

/** A horizontal line across the plot with a label, such as a threshold; an optional band is its range. */
export interface ReferenceLine extends Mark {
  kind: 'reference'
  y: number
  label: string
  /** The line's value at display size, in the right margin where there is room for it. */
  value?: string
  detail?: string
  band?: { top: number; bottom: number }
  /** The line rests on an estimate: it is drawn lighter, with a hollow ring at its end, and named so. */
  estimated?: boolean
}

/** A span of the x axis, drawn as a bracket at y with its label above it. */
export interface Bracket extends Mark {
  kind: 'bracket'
  x1: number
  x2: number
  y: number
  label: string
}

export type Annotation = EndLabel | Callout | ReferenceLine | Bracket

export type TextRole = 'eyebrow' | 'value' | 'unit' | 'caption' | 'label'

export interface PlacedText {
  role: TextRole
  text: string
  x: number
  y: number
  anchor: 'start' | 'middle' | 'end'
  /** A value's number and unit are one line: the unit follows the number in a tspan. */
  unit?: string
  /** A value's size in px at a 16 px root, which the layout measured it at. */
  px?: number
}

export interface PlacedAnnotation {
  id: string
  kind: Annotation['kind']
  tone: AnnotationTone
  texts: PlacedText[]
  /** The box the text takes, which no other annotation's text overlaps where room allowed. */
  box: Box
  leader: { x1: number; y1: number; x2: number; y2: number } | null
  /** A reference line's rule and range, or a bracket's span. */
  rule: { x1: number; x2: number; y: number } | null
  band: { top: number; bottom: number } | null
  /** A reference line that rests on an estimate. */
  estimated: boolean
  /** Whether the first choice of place was taken: false when a collision moved the annotation. */
  preferred: boolean
  /** Whether the text overlaps something it could not avoid. */
  crowded: boolean
}

export interface AnnotationSpace {
  plot: PlotBox
  /** The chart's width, for the margin right of the plot. */
  width: number
  /** The page's root font size, which the text is set against. */
  rootPx: number
  /** The data's own marks, as boxes the text keeps off, such as a line sampled along its length. */
  obstacles?: readonly Box[]
  /** A phone sets display values smaller. */
  phone?: boolean
}

/** How far a leader stops short of its point, so the marker's ring stays clear. */
export const LEADER_GAP = 7
/** The gap kept between two annotations' boxes, and between a box and the data. */
export const CLEARANCE = 2
export const LEADER_LENGTHS = [28, 50, 72]
export const END_NUDGES = [0, -16, 16, -32, 32]
export const LABEL_LINE = 14
export const DISPLAY_EM = 0.55
/** A reference line's value is smaller than a callout's: it is the line's label, not a finding. */
export const REFERENCE_VALUE_PX = 22

/** A callout's value size in px at 16 px root: display size, a step smaller on a phone. */
export function valuePx(phone: boolean): number {
  return phone ? 24 : 30
}

export function scaleOf(rootPx: number): number {
  return rootPx / DEFAULT_ROOT_PX
}

/** The width of a small label, from its length, as the axis labels are estimated. */
export function smallWidth(text: string, rootPx: number): number {
  return (text.length * GLYPH_EM + LABEL_PAD_EM) * LABEL_REM * rootPx
}

/** An eyebrow is set in bold capitals with tracking, which run about a fifth wider than the same text in sentence case. */
export function eyebrowWidth(text: string, rootPx: number): number {
  return smallWidth(text, rootPx) * 1.2
}

/** A display value's width: its number at display size and its unit at a little over half of it. */
export function valueWidth(value: string, px: number, rootPx: number): number {
  const { number, unit } = splitValue(value)
  return (number.length * px * DISPLAY_EM + unit.length * px * 0.6 * DISPLAY_EM) * scaleOf(rootPx)
}

/** "5:47 /mi" as its number and its unit, the unit with its leading space; a value with no space is all number. */
export function splitValue(value: string): { number: string; unit: string } {
  const at = value.indexOf(' ')
  return at < 0
    ? { number: value, unit: '' }
    : { number: value.slice(0, at), unit: value.slice(at) }
}
