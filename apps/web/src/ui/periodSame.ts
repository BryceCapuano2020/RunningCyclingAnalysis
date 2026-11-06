import { windowEnding } from '@rca/core/period'
import type { Period } from '@rca/core/period'
import { RANGE_OPTIONS, lengthOf } from './components/rangeOptions'

/** The fixed periods, shortest first, as the days they count back; all time (null) last. */
const FIXED_DAYS = RANGE_OPTIONS.map((option) =>
  typeof option.choice === 'number' ? option.choice : null,
)

function startedWithinDays(
  activities: readonly { startMs: number }[],
  days: number | null,
): number {
  if (days === null || activities.length === 0) return activities.length
  const newest = activities.reduce((high, item) => Math.max(high, item.startMs), -Infinity)
  const { startMs } = windowEnding(newest, days)
  return activities.filter((item) => item.startMs >= startMs).length
}

/**
 * The shortest period that holds the same activities as `period`, as its count and its length ("6 weeks"), where a longer period
 * holds nothing a shorter one does not. A period counts back from the latest activity, not from today. Null for a custom range,
 * for the shortest period, and where a shorter period holds fewer.
 */
export function sameAsShorter(
  activities: readonly { startMs: number }[],
  period: Period,
): { count: number; length: string } | null {
  if (typeof period.choice === 'object') return null
  const here = FIXED_DAYS.findIndex((days) => days === period.days)
  if (here <= 0) return null
  const count = startedWithinDays(activities, period.days)
  if (count === 0) return null
  for (const days of FIXED_DAYS.slice(0, here)) {
    if (days !== null && startedWithinDays(activities, days) === count) {
      return { count, length: lengthOf(days) }
    }
  }
  return null
}
