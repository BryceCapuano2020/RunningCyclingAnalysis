import type { ActivitySummary } from '@rca/core/pipeline'
import { localDayOf, startOfDayNumber } from '@rca/core/calendar'
import type { Dated } from '@rca/core/calendar'
import { monthKeyOfDay } from './activitiesVolume'
import { movingTimeOf } from './activityFigures'
import { formatMonth } from './format/date'

export const ACTIVITY_SORTS = ['newest', 'oldest', 'distance', 'time', 'climb'] as const
export type ActivitySort = (typeof ACTIVITY_SORTS)[number]

/** The sort menu's names, in the order of ACTIVITY_SORTS. */
export const SORT_LABELS: Record<ActivitySort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  distance: 'Longest distance',
  time: 'Longest time',
  climb: 'Most climb',
}

/** Largest first, by the figure valueOf gives. */
function largestFirst(valueOf: (activity: ActivitySummary) => number) {
  return (a: ActivitySummary, b: ActivitySummary) => valueOf(b) - valueOf(a)
}

const COMPARE: Record<ActivitySort, (a: ActivitySummary, b: ActivitySummary) => number> = {
  newest: (a, b) => b.startMs - a.startMs,
  oldest: (a, b) => a.startMs - b.startMs,
  distance: largestFirst((activity) => activity.distanceM),
  time: largestFirst(movingTimeOf),
  climb: largestFirst((activity) => activity.elevationGainM),
}

/** The activities in the order the sort names. A new array: the list given is not changed. */
export function sortActivities(
  activities: readonly ActivitySummary[],
  sort: ActivitySort,
): ActivitySummary[] {
  return [...activities].sort(COMPARE[sort])
}

export interface MonthGroup<T> {
  key: string
  /** The month and year, such as "Jun 2025", as the group's heading. */
  label: string
  items: T[]
}

/** Runs of items that fall in the same calendar month, in the order given. */
export function groupByMonth<T extends Dated>(items: readonly T[]): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = []
  for (const item of items) {
    // By local day, as the month totals are keyed, so a row is under the heading whose totals count it.
    const day = localDayOf(item)
    const key = monthKeyOfDay(day)
    const last = groups.at(-1)
    if (last?.key === key) {
      last.items.push(item)
    } else {
      groups.push({ key, label: formatMonth(startOfDayNumber(day), true), items: [item] })
    }
  }
  return groups
}
