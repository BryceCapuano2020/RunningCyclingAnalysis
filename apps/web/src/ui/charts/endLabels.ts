import { ASCENT_EM, DESCENT_EM } from './chartBoxes'
import type { Box } from './chartBoxes'
import { LABEL_GAP_X, spreadWithin } from './chartInteraction'
import type { ChartSize, Point } from './chartTypes'
import { labelSizePx, labelWidthPx, rootFontPx } from './rootFont'

/** The last point of a line, to be named at its end. */
export interface LineEnd<K extends string> {
  kind: K
  /** The label's text, such as "Run 64%". */
  text: string
  /** A mark that leads the text and stands for the line, such as a dot, where the text has no sport name. */
  glyph?: string
  point: Point
}

/** A label placed: its text, and the baseline point it is set at, left-aligned (`start`) or right-aligned (`end`). */
export interface PlacedLabel<K extends string> {
  kind: K
  text: string
  glyph?: string
  anchor: 'start' | 'end'
  at: Point
}

/** The room a label's box keeps from another's, in px. */
const CLEAR_PX = 2

const overlaps = (a: Box, b: Box): boolean =>
  a.left < b.right + CLEAR_PX &&
  b.left < a.right + CLEAR_PX &&
  a.top < b.bottom + CLEAR_PX &&
  b.top < a.bottom + CLEAR_PX

/**
 * The end labels of a chart's lines, none over another and all inside the chart. A line that reaches the
 * plot's right edge is named in the gutter beside it, level with its end, the labels spread apart where the
 * ends are close. A line that stops early is named just past its own end, or above it when the room to the
 * right is short. A label placed over another is moved down by the room it needs, or up where the bottom
 * is reached, so no two ever share a place.
 */
export function placeEndLabels<K extends string>(
  ends: readonly LineEnd<K>[],
  size: ChartSize,
): PlacedLabel<K>[] {
  const rootPx = rootFontPx()
  const em = labelSizePx(rootPx)
  const level = ((ASCENT_EM - DESCENT_EM) / 2) * em
  const span = { lo: size.plot.top + ASCENT_EM * em, hi: size.plot.bottom - DESCENT_EM * em }
  const line = (ASCENT_EM + DESCENT_EM) * em
  const widthOf = (end: { text: string; glyph?: string }) =>
    labelWidthPx(end.glyph === undefined ? end.text : `${end.glyph} ${end.text}`, rootPx)
  const inGutter = ends.filter((end) => end.point.x >= size.plot.right - 1)
  const gutterYs = spreadWithin(
    inGutter.map((end) => end.point.y + level),
    line,
    span.lo,
    span.hi,
  )
  const placed: PlacedLabel<K>[] = ends.map((end) => {
    const index = inGutter.indexOf(end)
    if (index >= 0) {
      return {
        kind: end.kind,
        text: end.text,
        ...glyphOf(end),
        anchor: 'start',
        at: { x: end.point.x + LABEL_GAP_X, y: gutterYs[index] ?? end.point.y },
      }
    }
    const right = end.point.x + LABEL_GAP_X
    const fits = right + widthOf({ text: end.text }) <= size.width - 2
    // Beside its own end marker a label needs no mark of its own to say which line it names.
    return {
      kind: end.kind,
      text: end.text,
      anchor: fits ? 'start' : 'end',
      at: fits
        ? { x: right, y: end.point.y + level }
        : { x: end.point.x - LABEL_GAP_X, y: end.point.y - em },
    }
  })
  return keepApart(placed, widthOf, em, span)
}

function glyphOf(end: { glyph?: string }): { glyph?: string } {
  return end.glyph === undefined ? {} : { glyph: end.glyph }
}

function boxOf<K extends string>(label: PlacedLabel<K>, width: number, em: number): Box {
  const left = label.anchor === 'end' ? label.at.x - width : label.at.x
  return {
    left,
    right: left + width,
    top: label.at.y - ASCENT_EM * em,
    bottom: label.at.y + DESCENT_EM * em,
  }
}

/** Moves any label that overlaps an earlier one down past it, or up past it where that would leave the plot. */
function keepApart<K extends string>(
  labels: PlacedLabel<K>[],
  widthOf: (end: { text: string; glyph?: string }) => number,
  em: number,
  span: { lo: number; hi: number },
): PlacedLabel<K>[] {
  const out = labels.map((label) => ({ ...label, at: { ...label.at } }))
  const widths = out.map((label) => widthOf(label))
  const step = (ASCENT_EM + DESCENT_EM) * em + CLEAR_PX
  // Top to bottom, so the one lower on the chart is the one that moves down.
  const order = out.map((_, i) => i).sort((a, b) => out[a]!.at.y - out[b]!.at.y)
  order.forEach((i, rank) => {
    const label = out[i]!
    for (const j of order.slice(0, rank)) {
      const other = out[j]!
      if (!overlaps(boxOf(label, widths[i]!, em), boxOf(other, widths[j]!, em))) continue
      const down = other.at.y + step
      label.at.y = down <= span.hi ? down : other.at.y - step
    }
    label.at.y = Math.min(Math.max(label.at.y, span.lo), span.hi)
  })
  return out
}
