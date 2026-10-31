import { WEEK_MS, weekEndFor } from '@rca/core/calendar'

/**
 * The weeks the hours trained are drawn on: from the week the period starts in through the weekly trend's last. A
 * period's trend begins later than the period does, since a point's trailing window may not reach back before it,
 * so the hours would cover only the weeks the trend does; these cover the whole period. Without a start
 * (all time), or a trend, they are the trend's own weeks.
 */
export function periodWeekEnds(
  trendEndsMs: readonly number[],
  periodStartMs: number | null,
): number[] {
  const first = trendEndsMs[0]
  const last = trendEndsMs.at(-1)
  if (first === undefined || last === undefined) return []
  const from =
    periodStartMs === null ? first : Math.min(first, weekEndFor({ startMs: periodStartMs }))
  const ends: number[] = []
  for (let end = from; end <= last; end += WEEK_MS) ends.push(end)
  return ends
}
