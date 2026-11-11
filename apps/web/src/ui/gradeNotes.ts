import type { Sport } from '@rca/core/types'

/** What GAP means, in the note beside the term wherever a run's pace is written as one. */
export const GAP_MEANING =
  'Grade-adjusted pace: your pace allowing for hills, as if on level ground.'

/** The note under splits where a steep descent has left a GAP out. */
export const STEEP_DESCENT_NOTE =
  'GAP is left out where a steep descent would make it much slower than the pace you ran.'

/** The labels of the records that have no standard, as a phrase: "5 min", "3 min and 5 min". */
function labelList(labels: readonly string[]): string {
  return labels.length < 2
    ? (labels[0] ?? '')
    : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`
}

/**
 * A record's missing standard in a few words, naming the records it is for so it can sit apart from their rows:
 * a run has none under a mile, a ride none at some durations. Without a label it speaks of the one it is under.
 */
export const NO_STANDARD_RECORD_TEXT: Record<Sport, (labels: readonly string[]) => string> = {
  run: (labels) =>
    labels.length === 0
      ? 'No age standard under 1 mile'
      : `No age standard under 1 mile, for the ${labelList(labels)}`,
  ride: (labels) =>
    labels.length === 0
      ? 'No age standard for this duration'
      : `No age standard for the ${labelList(labels)}`,
}
