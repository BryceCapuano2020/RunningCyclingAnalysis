import { DEFAULT_PERIOD_DAYS as DEFAULT_DAYS, windowEnding } from '@rca/core/period'
import type { Period } from '@rca/core/period'
import { formatCount } from './format/count'
import { RANGE_OPTIONS, lengthOf } from './components/rangeOptions'

/** The fixed periods, shortest first, as the days they count back; all time (null) last. */
const FIXED_DAYS = RANGE_OPTIONS.map((option) =>
  typeof option.choice === 'number'
    ? option.choice
    : option.choice === 'default'
      ? DEFAULT_DAYS
      : null,
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
 * Where a longer period holds nothing a shorter one does not, which it says rather than repeat in silence:
 * "Same 14 activities as 6 weeks", naming the shortest period with the same activities. Null for a custom range,
 * for the shortest period, and where a shorter period holds fewer.
 */
export function sameAsShorterText(
  activities: readonly { startMs: number }[],
  period: Period,
): string | null {
  if (typeof period.choice === 'object') return null
  const here = FIXED_DAYS.findIndex((days) => days === period.days)
  if (here <= 0) return null
  const count = startedWithinDays(activities, period.days)
  if (count === 0) return null
  for (const days of FIXED_DAYS.slice(0, here)) {
    if (days !== null && startedWithinDays(activities, days) === count) {
      return `Same ${formatCount(count)} ${count === 1 ? 'activity' : 'activities'} as ${lengthOf(days)}`
    }
  }
  return null
}
