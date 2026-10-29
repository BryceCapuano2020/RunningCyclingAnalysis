import type { ActivitySummary } from '@rca/core/pipeline'
import { plural } from '../components/plural'

/*
 * Runs at walking pace: hikes recorded as runs. The core keeps them in the library and leaves them out of every
 * analysis (`ActivityDigest.walkingPace`); this is what the pages say about them.
 */

/** The mark on a list row and an activity's header. */
export const WALKING_PACE_CHIP = 'Walking pace'

/** The line on an activity page, in the place of its best efforts. */
export const WALKING_PACE_NOTE =
  'This run is at walking pace, so it is left out of your run analysis.'

/** The line under the import notices for the saved runs at walking pace. */
export function walkingPaceText(count: number): string {
  return (
    `${plural(count, 'saved run is', 'saved runs are')} at walking pace, so ` +
    `${count === 1 ? 'it stays' : 'they stay'} in your activities and ` +
    `${count === 1 ? 'is' : 'are'} left out of your run analysis.`
  )
}

/**
 * The library as the analysis holds it: without the runs at walking pace. The counts and dates a page gives
 * of what the analysis rests on come from here, so a library of hikes does not read as one of runs.
 */
export function withoutWalking(library: ActivitySummary[]): ActivitySummary[] {
  return library.filter((activity) => activity.walkingPace !== true)
}
