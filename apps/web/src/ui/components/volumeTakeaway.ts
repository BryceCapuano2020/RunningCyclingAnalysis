import type { ActivitySummary } from '@rca/core/pipeline'
import {
  countsText,
  emptyTotals,
  formatHoursText,
  secondsOf,
  volumeBuckets,
} from '../activitiesVolume'
import { VOLUME_KINDS } from '../volumeKinds'
import type { LiftDay } from '../volumeKinds'

/** What the strip holds in a line, for a page's Details: "1,801 runs and 149 rides, 1,706 h, across all time". */
export function volumeTakeaway(
  activities: readonly ActivitySummary[],
  periodText: string,
  lifts: readonly LiftDay[] = [],
): string {
  const all = emptyTotals()
  for (const bucket of volumeBuckets(activities, false, lifts)) {
    for (const kind of VOLUME_KINDS) {
      all[kind].count += bucket.totals[kind].count
      all[kind].seconds += bucket.totals[kind].seconds
    }
  }
  return `${countsText(all)}, ${formatHoursText(secondsOf(all))}, ${periodText}`
}
