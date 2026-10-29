import { useMemo } from 'react'
import { weeksWithValue } from '@rca/core/digest/trendPoints'
import type { TrendPoint } from '@rca/core/digest'
import type { ActivitySummary } from '@rca/core/pipeline'
import { timeAxisOf } from '@rca/core/digest/trendSeries'
import { gradeWeeks } from '../charts'
import { hasRealVolume } from '../charts/monthlyVolume'
import { onSharedWeeks, periodWeekEnds } from '../charts/sharedWeeks'
import { trendGutter } from '../charts/sharedTrendGutter'
import type { AgeProfile } from '../grades'
import { weeklyVolume } from '../weeklyVolume'

export interface BalanceTrendInput {
  trend: readonly TrendPoint[]
  activities: readonly ActivitySummary[]
  /** The first day of the period on screen; null for all time. */
  periodStartMs: number | null
  profile: AgeProfile | null
  weightKnown: boolean
}

/**
 * What the trend and the hours under it on Balance share: one run of weeks, the whole period, so the hours span it
 * though the trend begins later (its first point's window cannot reach back before the period); the graded weeks on
 * those weeks; the time axis both draw on; and the margin the end labels need, which the hours take too, so the two
 * line up.
 */
export function useBalanceTrend({
  trend,
  activities,
  periodStartMs,
  profile,
  weightKnown,
}: BalanceTrendInput) {
  const weekEnds = useMemo(
    () =>
      periodWeekEnds(
        trend.map((point) => point.endMs),
        periodStartMs,
      ),
    [trend, periodStartMs],
  )
  // The hours trained in those weeks, which the strip under the trend draws; null folds it away.
  const volume = useMemo(() => weeklyVolume(activities, weekEnds), [activities, weekEnds])
  // The trend's weeks: without an age and sex there is no grade to draw, so the trend has no weeks and says what it waits for.
  const trendWeeks = useMemo(
    () =>
      weeksWithValue(trend) === 0 || profile === null
        ? []
        : onSharedWeeks(gradeWeeks(trend, profile), weekEnds),
    [trend, profile, weekEnds],
  )
  // A week counts if the trend has a value or the athlete trained, and the week the period starts in always does.
  const axis = useMemo(
    () =>
      timeAxisOf(
        weekEnds,
        weekEnds.map(
          (_, i) =>
            i === 0 ||
            trendWeeks[i]?.run != null ||
            trendWeeks[i]?.ride != null ||
            (volume?.[i] !== undefined && hasRealVolume(volume[i])),
        ),
      ),
    [weekEnds, trendWeeks, volume],
  )
  const gutter = useMemo(
    () => trendGutter(trendWeeks, weightKnown, axis),
    [trendWeeks, weightKnown, axis],
  )
  return { volume, trendWeeks, axis, gutter }
}
