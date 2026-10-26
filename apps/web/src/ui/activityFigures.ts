import type { ActivitySummary } from '@rca/core/pipeline'

/**
 * The figures an activity's list row and its page both show, worked out in one place. An activity
 * from before moving time was kept has only its elapsed time, so its figures say so.
 */

/** The seconds an activity is timed by: its moving time, or its elapsed time when that is not kept. */
export function movingTimeOf(activity: ActivitySummary): number {
  return activity.movingS ?? activity.durationS
}

/** What the time figure is called: moving time when it is kept, else elapsed time. */
export function timeLabelOf(activity: ActivitySummary): string {
  return activity.movingS === undefined ? 'Elapsed time' : 'Moving time'
}

/**
 * The readings the app left out of an activity's figures, counted as the flags of each kind. The
 * summary keeps only the first flags, so the count comes from flagCounts.
 */
export function skippedCountOf(activity: ActivitySummary): number {
  return Object.values(activity.flagCounts).reduce((sum, count) => sum + (count ?? 0), 0)
}
