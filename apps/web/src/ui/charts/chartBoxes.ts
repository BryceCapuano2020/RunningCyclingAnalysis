import type { Point } from './chartTypes'
import { labelSizePx, labelWidthPx } from './rootFont'

/** A label's box reaches an em above its baseline and a quarter em below, as its ink does. */
export const ASCENT_EM = 1
export const DESCENT_EM = 0.25

/** A rectangle on the chart, in px. */
export interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

/** The box a label takes, with its baseline at the point's y: its text ends at the point's x, or starts there. */
export function textBox(
  text: string,
  at: Point,
  rootPx: number,
  anchor: 'start' | 'end' = 'end',
): Box {
  const em = labelSizePx(rootPx)
  const width = labelWidthPx(text, rootPx)
  const left = anchor === 'end' ? at.x - width : at.x
  return {
    left,
    right: left + width,
    top: at.y - ASCENT_EM * em,
    bottom: at.y + DESCENT_EM * em,
  }
}

/**
 * The ride band as stepBandPath draws it, in boxes: a stretch from each week's x to the next, which holds
 * the earlier week's range, and the two step connectors at the later week's x. A stretch is drawn only
 * where both of its weeks have a range, since stepBandPath breaks the band at a week without one.
 */
export function bandBoxes(
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

/**
 * A stepped line and its markers as boxes, as stepPath and the markers draw them: each value's level from
 * its sample to the next, the step connector at the next sample's x, and a marker of radius markerR at
 * every point. A null point breaks the line, as it does on the chart.
 */
export function stepBoxes(points: readonly (Point | null)[], markerR: number): Box[] {
  return points.flatMap((point, i) => {
    if (point === null) return []
    const marker = {
      left: point.x - markerR,
      right: point.x + markerR,
      top: point.y - markerR,
      bottom: point.y + markerR,
    }
    const before = i === 0 ? null : (points[i - 1] ?? null)
    if (before === null) return [marker]
    return [
      marker,
      { left: before.x, right: point.x, top: before.y, bottom: before.y },
      {
        left: point.x,
        right: point.x,
        top: Math.min(before.y, point.y),
        bottom: Math.max(before.y, point.y),
      },
    ]
  })
}

/** The pieces that an x-range meets. */
export function stretchesUnder(pieces: readonly Box[], left: number, right: number): Box[] {
  return pieces.filter((stretch) => stretch.left <= right && stretch.right >= left)
}

/** Whether a box comes within pad px of any piece. A box that only touches a piece at pad 0 does not. */
export function meetsBoxes(box: Box, pieces: readonly Box[], pad: number): boolean {
  return pieces.some(
    (piece) =>
      piece.left - pad < box.right &&
      piece.right + pad > box.left &&
      piece.top - pad < box.bottom &&
      piece.bottom + pad > box.top,
  )
}
