import { inGap, lineBreaks, rowBreaks, thinTrend, timeAxisOf } from '@rca/core/digest/trendSeries'
import type { TimeAxis } from '@rca/core/digest/trendSeries'
import { SPORT_ORDER } from '../sports'
import type { Sport } from '@rca/core/types'
import type { SharedWeek } from './gradeTrend'

/** The fields of a week that a month averages: both sports' values and the ride's range. */
const MEANS = ['run', 'ride', 'rideLow', 'rideHigh'] as const

/** What a shared trend draws: its rows, whether they are months, and where each sport's line breaks. */
export interface TrendRows {
  /** One row a week, or past 26 weeks one a month, the last always the latest reading itself. */
  rows: SharedWeek[]
  /** The weeks the rows are made of, unthinned: what a title is judged on, so a week is compared with weeks. */
  weekly: SharedWeek[]
  monthly: boolean
  /** For each row, how many weeks it stands for. */
  weeksIn: number[]
  /** For each row and each sport, whether its line starts afresh there after a gap of eight weeks or more. */
  breaks: Record<Sport, boolean[]>
  /** The span the rows cover and the year-long gaps the time axis skips: none when no week has a value. */
  axis: TimeAxis | null
}

/** Whether a week holds a value of either sport. */
export const hasSharedValue = (week: SharedWeek): boolean => week.run !== null || week.ride !== null

/**
 * The rows of a shared trend. The weeks outside the axis (before its first active week and after its last) are
 * left off, and so are those inside a gap it skips. Of the rest, up to 26 weeks of span each is a row, and past
 * that each month is, with the breaks of each sport's line found on the weeks, so a month does not hide a gap.
 * The axis is the caller's, when a chart under this one shares it, else the weeks' own.
 */
export function trendRowsOf(weeks: readonly SharedWeek[], given?: TimeAxis | null): TrendRows {
  const axis =
    given ??
    timeAxisOf(
      weeks.map((week) => week.endMs),
      weeks.map(hasSharedValue),
    )
  const inSpan =
    axis === null
      ? []
      : weeks.filter((week) => week.endMs >= axis.startMs && week.endMs <= axis.endMs)
  const flags = Object.fromEntries(
    SPORT_ORDER.map((sport) => [sport, lineBreaks(inSpan.map((week) => week[sport] !== null))]),
  ) as Record<Sport, boolean[]>
  const live = inSpan.map((week) => axis === null || !inGap(axis.gaps, week.endMs))
  const kept = inSpan.filter((_, i) => live[i])
  const thinned = thinTrend(kept, MEANS)
  const breaks = Object.fromEntries(
    SPORT_ORDER.map((sport) => [
      sport,
      rowBreaks(
        thinned.rows,
        flags[sport].filter((_, i) => live[i]),
      ),
    ]),
  ) as Record<Sport, boolean[]>
  return {
    rows: thinned.rows.map(({ row }) => row),
    weekly: kept,
    monthly: thinned.monthly,
    weeksIn: thinned.rows.map(({ weeks: covered }) => covered.length),
    breaks,
    axis,
  }
}
