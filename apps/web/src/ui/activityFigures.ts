import type { ActivitySummary } from '@rca/core/pipeline'
import { removesReadingsOf, skippedReadings } from './analysis/flagCopy'

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
 * The readings the app left out of an activity's figures: the true counts of the kinds that remove
 * readings. The summary keeps only the first flags, so the count comes from flagCounts. Altitude
 * notes are not readings, so they are not counted.
 */
export function skippedCountOf(activity: ActivitySummary): number {
  return skippedReadings(activity.flagCounts)
}

/**
 * The share of an activity's time that skipped readings cover before a list row says so. A sensor that
 * blips for a few seconds leaves an average where it was; a skip this long moves one. The activity's
 * own page lists every skip whatever its length.
 */
export const SKIPPED_MATERIAL_SHARE = 0.01

/**
 * The readings skipped that are worth a warning on a list row: the count from `skippedCountOf`, or 0 when
 * the skipped stretches together cover under SKIPPED_MATERIAL_SHARE of the activity's time. The digest
 * keeps only its first flags, so when it dropped some there were more skips than it can show, which is
 * many.
 */
export function materialSkippedCountOf(activity: ActivitySummary): number {
  const count = skippedCountOf(activity)
  if (count === 0) return 0
  const kept = activity.flags.filter((flag) => removesReadingsOf(flag.kind))
  if (count > kept.length) return count
  const skippedS = kept.reduce((sum, flag) => sum + (flag.end - flag.start), 0)
  return skippedS >= SKIPPED_MATERIAL_SHARE * movingTimeOf(activity) ? count : 0
}
