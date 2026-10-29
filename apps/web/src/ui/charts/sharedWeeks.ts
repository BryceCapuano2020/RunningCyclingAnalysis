import { DAY_MS } from '@rca/core/constants'
import { weekEndMs } from '@rca/core/digest/trendPoints'
import type { SharedWeek } from './gradeTrend'

const WEEK_MS = 7 * DAY_MS

/**
 * The weeks the grade trend and the hours under it share: from the week the period starts in through the trend's
 * last. A period's trend begins later than the period does, since a point's trailing window may not reach back
 * before it, so the hours would cover only the weeks the trend does; these cover the whole period. Without a start
 * (all time), or a trend, they are the trend's own weeks.
 */
export function periodWeekEnds(
  trendEndsMs: readonly number[],
  periodStartMs: number | null,
): number[] {
  const first = trendEndsMs[0]
  const last = trendEndsMs.at(-1)
  if (first === undefined || last === undefined) return []
  const from = periodStartMs === null ? first : Math.min(first, weekEndMs(periodStartMs))
  const ends: number[] = []
  for (let end = from; end <= last; end += WEEK_MS) ends.push(end)
  return ends
}

/** A week with no grade: the weeks of a period before its trend begins, so the trend starts where its data does. */
function emptyWeek(endMs: number): SharedWeek {
  return { endMs, run: null, ride: null, rideLow: null, rideHigh: null, runCount: 0, rideCount: 0 }
}

/** The graded weeks laid on the shared weeks, a week with no grade where the trend has none. */
export function onSharedWeeks(
  weeks: readonly SharedWeek[],
  endsMs: readonly number[],
): SharedWeek[] {
  const byEnd = new Map(weeks.map((week) => [week.endMs, week]))
  return endsMs.map((endMs) => byEnd.get(endMs) ?? emptyWeek(endMs))
}
