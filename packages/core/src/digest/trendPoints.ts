import { HEADLINE_DURATION_S } from '../constants'
import type { TrendPoint } from './trend'

/** The trailing window of a trend point over all time, in days. */
export const DEFAULT_WINDOW_DAYS = 42
/** The shortest trailing window, in days: a shorter one would judge a single session. */
export const MIN_WINDOW_DAYS = 7

/** The effort lengths a trend describes, in seconds: 5, 20 and 60 minutes. */
export const EFFORT_LENGTHS_S = [300, HEADLINE_DURATION_S, 3600] as const
export type EffortLengthS = (typeof EFFORT_LENGTHS_S)[number]

/**
 * The trends of a period with no activities: an empty trend for every effort length. Frozen, since
 * every empty state shares it.
 */
export const NO_TRENDS = Object.freeze(
  Object.fromEntries(
    EFFORT_LENGTHS_S.map((durationS) => [durationS, Object.freeze([] as TrendPoint[])]),
  ) as Record<EffortLengthS, readonly TrendPoint[]>,
)

/**
 * The trailing window of a trend point for a period of rangeDays (null for all time): a third of the
 * period, between one week and six, so a six-week period is judged in two-week windows.
 */
export function trendWindowDays(rangeDays: number | null): number {
  if (rangeDays === null) return DEFAULT_WINDOW_DAYS
  return Math.max(MIN_WINDOW_DAYS, Math.min(DEFAULT_WINDOW_DAYS, Math.round(rangeDays / 3)))
}

/**
 * How many points have a run or a ride value. A trend needs at least two to be drawn. Kept apart
 * from trend.ts so the main thread can use it without loading the analysis.
 */
export function weeksWithValue(points: readonly TrendPoint[]): number {
  return points.filter((point) => point.runWkg !== null || point.rideWkg !== null).length
}
