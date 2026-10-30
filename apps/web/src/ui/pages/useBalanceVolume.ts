import { useMemo } from 'react'
import type { TrendPoint } from '@rca/core/digest'
import type { ActivitySummary } from '@rca/core/pipeline'
import { timeAxisOf } from '@rca/core/digest/trendSeries'
import { hasRealVolume } from '../charts/monthlyVolume'
import { periodWeekEnds } from '../charts/periodWeeks'
import { weeklyVolume } from '../weeklyVolume'

export interface BalanceVolumeInput {
  trend: readonly TrendPoint[]
  activities: readonly ActivitySummary[]
  /** The first day of the period on screen; null for all time. */
  periodStartMs: number | null
}

/**
 * The hours trained in each week of the period, and the time axis they are drawn on. The weeks run from the one
 * the period starts in (or the first activity's) to the last; a week counts on the axis if the athlete trained in
 * it, and the week the period starts in always does, so a long quiet stretch is skipped and marked.
 */
export function useBalanceVolume({ trend, activities, periodStartMs }: BalanceVolumeInput) {
  const weekEnds = useMemo(
    () =>
      periodWeekEnds(
        trend.map((point) => point.endMs),
        periodStartMs,
      ),
    [trend, periodStartMs],
  )
  const volume = useMemo(() => weeklyVolume(activities, weekEnds), [activities, weekEnds])
  const axis = useMemo(
    () =>
      timeAxisOf(
        weekEnds,
        weekEnds.map((_, i) => i === 0 || (volume?.[i] !== undefined && hasRealVolume(volume[i]))),
      ),
    [weekEnds, volume],
  )
  return { volume, axis }
}
