import { DAY_MS } from '@rca/core/constants'
import type { TrainingWeek } from '@rca/core/history'
import { plural } from '../components/plural'
import { SPORT_DOING } from '../sports'
import { totalOfWeek } from './calendarGrid'
import type { CalendarFilter } from './calendarGrid'
import { shortDateWithYear } from './trendTicks'

/** What the weeks say that no cell does: the longest run of weeks with training, and the week with the most hours. */
export interface CalendarFindings {
  /** The most weeks in a row with training. */
  streakWeeks: number
  /** The day number of the Monday of the streak's last week. */
  streakEndDay: number
  bigHours: number
  /** The day number of the Monday of the biggest week. */
  bigDay: number
}

/**
 * The longest streak of weeks with training (the latest of equals) and the biggest week, over the sports the filter keeps.
 * Null when no week has training.
 */
export function findingsOf(
  weeks: readonly TrainingWeek[],
  filter: CalendarFilter,
): CalendarFindings | null {
  let found: CalendarFindings | null = null
  let run = 0
  for (const week of weeks) {
    const { hours, activities } = totalOfWeek(week, filter)
    run = activities > 0 ? run + 1 : 0
    if (activities === 0) continue
    found ??= {
      streakWeeks: run,
      streakEndDay: week.mondayDay,
      bigHours: hours,
      bigDay: week.mondayDay,
    }
    if (run >= found.streakWeeks) {
      found.streakWeeks = run
      found.streakEndDay = week.mondayDay
    }
    if (hours > found.bigHours) {
      found.bigHours = hours
      found.bigDay = week.mondayDay
    }
  }
  return found
}

const dateOf = (day: number): string => shortDateWithYear(day * DAY_MS)

/** The two findings as sentences, such as "Your longest streak was 41 weeks, ending the week of 5 May 2019." */
export function findingsText(found: CalendarFindings, filter: CalendarFilter): string {
  const doing = filter === 'all' ? '' : `${SPORT_DOING[filter]} `
  return [
    `Your longest ${doing}streak was ${plural(found.streakWeeks, 'week')}, ending the week of ${dateOf(found.streakEndDay)}.`,
    `Your biggest ${doing}week was ${found.bigHours.toFixed(1)} hours, in the week of ${dateOf(found.bigDay)}.`,
  ].join(' ')
}
