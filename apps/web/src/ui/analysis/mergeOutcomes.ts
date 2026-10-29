import type { ImportOutcome } from '../../worker/protocol'

const sum = (a: number | undefined, b: number | undefined): number | undefined =>
  a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0)

/**
 * The outcome of two imports read as one, for activities analysed in two or more provisional imports
 * and then kept together. Counts add up, and the span of start times covers both.
 */
export function mergeOutcomes(first: ImportOutcome, second: ImportOutcome): ImportOutcome {
  const starts = [first.firstStartMs, second.firstStartMs].filter((ms) => ms !== undefined)
  const ends = [first.lastStartMs, second.lastStartMs].filter((ms) => ms !== undefined)
  const filesAdded = sum(first.filesAdded, second.filesAdded)
  const notActivities = sum(first.notActivities, second.notActivities)
  const runs = sum(first.runs, second.runs)
  const rides = sum(first.rides, second.rides)
  const detailRestored = sum(first.detailRestored, second.detailRestored)
  return {
    activities: first.activities + second.activities,
    rejected: first.rejected + second.rejected,
    duplicates: [...first.duplicates, ...second.duplicates],
    ...(filesAdded === undefined ? {} : { filesAdded }),
    ...(notActivities === undefined ? {} : { notActivities }),
    ...(runs === undefined ? {} : { runs }),
    ...(rides === undefined ? {} : { rides }),
    ...(starts.length === 0 ? {} : { firstStartMs: Math.min(...starts) }),
    ...(ends.length === 0 ? {} : { lastStartMs: Math.max(...ends) }),
    ...(detailRestored === undefined ? {} : { detailRestored }),
  }
}
