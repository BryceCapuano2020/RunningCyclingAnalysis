import { weekEndMs } from '@rca/core/digest/trendPoints'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { movingTimeOf } from './activityFigures'
import { SPORT_ORDER } from './sports'

/** One week of training: the moving seconds in each sport, in the week that ends at `endMs`. */
export interface VolumeWeek {
  /** The Sunday 23:59:59.999 UTC that ends the week, as the trend dates its weeks. */
  endMs: number
  seconds: Record<Sport, number>
}

/** The fewest weeks with training that make a volume strip worth showing. */
export const MIN_TRAINING_WEEKS = 3

const SECONDS_PER_HOUR = 3600

function noSeconds(): Record<Sport, number> {
  return Object.fromEntries(SPORT_ORDER.map((sport) => [sport, 0])) as Record<Sport, number>
}

/** The hours in a number of seconds. */
export function hoursOf(seconds: number): number {
  return seconds / SECONDS_PER_HOUR
}

/** All sports' moving seconds in a week. */
export function totalSeconds(week: VolumeWeek): number {
  return SPORT_ORDER.reduce((sum, sport) => sum + week.seconds[sport], 0)
}

/** Whether the week holds any training. */
export function trained(week: VolumeWeek): boolean {
  return totalSeconds(week) > 0
}

/**
 * Moving time in each sport, week by week, over the weeks the trend draws (`weekEnds`, each the end of
 * a trend point), so the strip and the trend share one time axis. An activity is counted in the week it
 * started in, cut at the same UTC Sunday the trend is cut at; one outside those weeks is not counted.
 * Null when fewer than MIN_TRAINING_WEEKS of them hold any training, since three bars show no pattern.
 */
export function weeklyVolume(
  activities: readonly ActivitySummary[],
  weekEnds: readonly number[],
): VolumeWeek[] | null {
  const weeks = weekEnds.map((endMs) => ({ endMs, seconds: noSeconds() }))
  const byEnd = new Map(weeks.map((week) => [week.endMs, week]))
  for (const activity of activities) {
    const week = byEnd.get(weekEndMs(activity.startMs))
    if (week !== undefined) week.seconds[activity.sport] += movingTimeOf(activity)
  }
  return weeks.filter(trained).length >= MIN_TRAINING_WEEKS ? weeks : null
}

/** Hours to one decimal place, such as "3.2": the figure a bar, a tooltip and the table all give. */
export function formatHours(seconds: number): string {
  return hoursOf(seconds).toFixed(1)
}
