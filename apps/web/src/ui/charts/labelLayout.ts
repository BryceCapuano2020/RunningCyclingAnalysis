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
}

export interface LabelPlacement {
  /** The ids drawn, in the order given. */
  kept: string[]
  /** The ids left out, lowest priority first. Every value stays in the chart's table twin. */
  dropped: string[]
}

/**
 * Which labels to draw. Labels are taken in priority order (input order breaks a tie); one is kept when it lies
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
    const { box } = label
    const inside =
      box.left >= bounds.left &&
      box.right <= bounds.right &&
      box.top >= bounds.top &&
      box.bottom <= bounds.bottom
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
