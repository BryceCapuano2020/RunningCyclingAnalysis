import { meetsBoxes } from './chartBoxes'
import type { Box } from './chartBoxes'

/** The air kept between two labels, px: enough that two words never read as one. */
export const LABEL_CLEARANCE = 4

/** A label to place: where it would sit, and how much it matters. */
export interface LabelCandidate {
  id: string
  /** The label's box, measured at the reader's text size (see textEm in rootFont). */
  box: Box
  /** Lower is placed first: the bests, the threshold and the end labels before ticks and captions. */
  priority: number
  /**
   * An end label of an axis, which must not be lost to the bounds: its box is moved inside them (its left edge
   * kept when it is wider than they are) before it is tried. It can still be dropped for meeting a label of
   * higher priority, since two ends that cannot both fit leave no room for either.
   */
  clamp?: boolean
}

/** The box moved inside `bounds` without changing its size; one wider than the bounds keeps its left edge in. */
function clampedInto(box: Box, bounds: Box): Box {
  const width = box.right - box.left
  const height = box.bottom - box.top
  const left = Math.max(bounds.left, Math.min(box.left, bounds.right - width))
  const top = Math.max(bounds.top, Math.min(box.top, bounds.bottom - height))
  return { left, right: left + width, top, bottom: top + height }
}

export interface LabelPlacement {
  /** The ids drawn, in the order given. */
  kept: string[]
  /** The ids left out, lowest priority first. Every value stays in the chart's table twin. */
  dropped: string[]
}

/**
 * Which labels to draw. Labels are taken in priority order (labels of equal priority in the order given, so the
 * answer does not depend on how a caller sorted its input); one is kept when it lies
 * inside `bounds` and keeps LABEL_CLEARANCE from every label already kept, and is otherwise dropped, so what
 * is lost to a collision is always the lowest-priority label, never a best or a threshold. Pure: the same boxes
 * give the same answer at any text size, and a larger text size only widens the boxes.
 */
export function labelLayout(labels: readonly LabelCandidate[], bounds: Box): LabelPlacement {
  const order = labels
    .map((label, index) => ({ label, index }))
    .sort((a, b) => a.label.priority - b.label.priority || a.index - b.index)
  const taken: Box[] = []
  const keptIds = new Set<string>()
  const dropped: string[] = []
  for (const { label } of order) {
    const box = label.clamp === true ? clampedInto(label.box, bounds) : label.box
    // A clamped box has been moved as far in as it goes, so only a collision can cost it.
    const inside =
      label.clamp === true ||
      (box.left >= bounds.left &&
        box.right <= bounds.right &&
        box.top >= bounds.top &&
        box.bottom <= bounds.bottom)
    if (inside && !meetsBoxes(box, taken, LABEL_CLEARANCE)) {
      taken.push(box)
      keptIds.add(label.id)
    } else {
      dropped.push(label.id)
    }
  }
  return {
    kept: labels.filter((label) => keptIds.has(label.id)).map((label) => label.id),
    dropped: dropped.reverse(),
  }
}
