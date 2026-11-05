import type { ActivitySummary } from '@rca/core/pipeline'
import {
  countsText,
  emptyTotals,
  formatHoursText,
  secondsOf,
  volumeBuckets,
} from '../activitiesVolume'
import { SPORT_ORDER } from '../sports'

/** What the strip holds in a line, for a page's Details: "1,801 runs and 149 rides, 1,706 h, across all time". */
export function volumeTakeaway(activities: readonly ActivitySummary[], periodText: string): string {
  const all = emptyTotals()
  for (const bucket of volumeBuckets(activities, false)) {
    for (const sport of SPORT_ORDER) {
      all[sport].count += bucket.totals[sport].count
      all[sport].seconds += bucket.totals[sport].seconds
    }
  }
  return `${countsText(all)}, ${formatHoursText(secondsOf(all))}, ${periodText}`
}
