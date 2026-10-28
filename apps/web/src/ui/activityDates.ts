import { DAY_MS } from '@rca/core/constants'
import type { Sport } from '@rca/core/types'
import { startOfLocalDay } from '@rca/core/period'
import type { ActivitySummary } from '@rca/core/pipeline'

/** The start of a sport's latest activity of any length, or null when the library holds none of it. */
export function latestStartOf(activities: ActivitySummary[], sport: Sport): number | null {
  let latest: number | null = null
  for (const activity of activities) {
    if (activity.sport === sport && (latest === null || activity.startMs > latest)) {
      latest = activity.startMs
    }
  }
  return latest
}

/**
 * Whole calendar days from one moment to a later one, in the device's zone. A clock change inside a
 * day does not make it a day short, since each moment is taken at the start of its own day.
 */
export function calendarDaysBetween(earlierMs: number, laterMs: number): number {
  return Math.round((startOfLocalDay(laterMs) - startOfLocalDay(earlierMs)) / DAY_MS)
}
