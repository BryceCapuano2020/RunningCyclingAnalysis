import { inGap, isMonthly, monthGroups, timeAxisOf } from '@rca/core/digest/trendSeries'
import type { TimeAxis } from '@rca/core/digest/trendSeries'
import { SPORT_ORDER } from '../sports'
import { hoursOf, totalSeconds } from '../weeklyVolume'
import type { VolumeWeek } from '../weeklyVolume'

/** What the volume chart draws: a bar for each week, or past 26 weeks for each month. */
export interface VolumeRows {
  /** Each row's `seconds` are per week: a week's own, or a month's average over its weeks. */
  rows: VolumeWeek[]
  monthly: boolean
  /** For each row, how many weeks it averages. */
  weeksIn: number[]
  /** The span the rows cover and the year-long gaps skipped between them: null when no week has real volume. */
  axis: TimeAxis | null
}

/** The fewest hours in a week that count as training to start or end the chart on, or to end a gap: an hour. */
export const REAL_VOLUME_HOURS = 1

/** Whether a week holds real volume, which a chart that shares its time axis with the trend adds to the trend's own. */
export const hasRealVolume = (week: VolumeWeek): boolean =>
  hoursOf(totalSeconds(week)) >= REAL_VOLUME_HOURS

/** Said under the chart when its bars are months, so a bar is not read as a month's total. */
export const MONTHLY_VOLUME_NOTE = 'Average hours a week, by month.'

/**
 * The rows of the volume chart. The weeks before the first with real volume and after the last are left off, and
 * so are those inside a gap of a year or more that the axis skips (the trend's own axis, when the two share one).
 * Of the rest, up to 26 weeks they are the weeks. Past that each calendar month is one
 * row, dated at its last week as the trend's month is, holding the average seconds a week over the weeks the
 * month has in the span, so a month with five Sundays does not stand taller than one with four, and the
 * partial months at either end are averaged over the weeks they hold.
 */
export function volumeRowsOf(weeks: readonly VolumeWeek[], given?: TimeAxis | null): VolumeRows {
  const axis =
    given ??
    timeAxisOf(
      weeks.map((week) => week.endMs),
      weeks.map(hasRealVolume),
    )
  const kept =
    axis === null
      ? []
      : weeks.filter(
          (week) =>
            week.endMs >= axis.startMs && week.endMs <= axis.endMs && !inGap(axis.gaps, week.endMs),
        )
  const ends = kept.map((week) => week.endMs)
  if (!isMonthly(ends)) {
    return { rows: kept, monthly: false, weeksIn: kept.map(() => 1), axis }
  }
  const groups = monthGroups(ends)
  const rows = groups.map((indices) => {
    const seconds = Object.fromEntries(
      SPORT_ORDER.map((sport) => [
        sport,
        indices.reduce((sum, i) => sum + kept[i]!.seconds[sport], 0) / indices.length,
      ]),
    ) as VolumeWeek['seconds']
    return { endMs: kept[indices.at(-1)!]!.endMs, seconds }
  })
  return { rows, monthly: true, weeksIn: groups.map((indices) => indices.length), axis }
}
