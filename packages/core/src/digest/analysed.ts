import type { ActivityDigest } from '../types'

/**
 * Whether the analysis reads an activity. A run at walking pace (a hike recorded as a run) and an activity the
 * athlete labelled something other than a run or a ride (Hike, Walk, a ski, a workout) stay in the library and are
 * left out of every figure. The athlete's choice to count one as a run (`countedRuns.ts`) takes either cause away.
 */
export function isAnalysed(digest: Pick<ActivityDigest, 'walkingPace' | 'athleteType'>): boolean {
  return digest.walkingPace !== true && digest.athleteType === undefined
}

/**
 * How many of the digests the analysis leaves out, and for which cause. The causes are disjoint: an activity
 * with both a label and a walking pace is counted once, under the label (the athlete's own word first), so the two
 * counts sum to the number left out.
 */
export function leftOutCounts(digests: readonly ActivityDigest[]): {
  labelled: number
  walking: number
} {
  let labelled = 0
  let walking = 0
  for (const digest of digests) {
    if (digest.athleteType !== undefined) labelled++
    else if (digest.walkingPace === true) walking++
  }
  return { labelled, walking }
}
