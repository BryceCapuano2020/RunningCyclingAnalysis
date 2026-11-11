import type { ActivitySummary } from '@rca/core/pipeline'
import {
  addTotals,
  countsText,
  emptyTotals,
  totalHoursText,
  volumeBuckets,
} from '../activitiesVolume'
import type { LiftDay } from '../volumeKinds'

/** What the strip holds in a line, for a page's Details: "1,801 runs and 149 rides, 1,706 h, across all time". */
export function volumeTakeaway(
  activities: readonly ActivitySummary[],
  periodText: string,
  lifts: readonly LiftDay[] = [],
): string {
  const all = emptyTotals()
  for (const bucket of volumeBuckets(activities, false, lifts)) addTotals(all, bucket.totals)
  return `${countsText(all)}, ${totalHoursText(all)}, ${periodText}`
}
