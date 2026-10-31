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

/** A chart of dots needs this many to draw: fewer than this, it shows its empty state. */
export const MIN_DOTS = 2

/** Which sport's effort lengths the dots' rule left too few dots to draw, that the same period has without it. */
export type DotsWithheld = Readonly<
  Record<'run' | 'ride', Readonly<Record<EffortLengthS, boolean>>>
>

const NO_LENGTH_WITHHELD = Object.freeze({ 300: false, 1200: false, 3600: false })

/** Nothing withheld: no rule, or no sport and length short. */
export const NONE_WITHHELD: DotsWithheld = Object.freeze({
  run: NO_LENGTH_WITHHELD,
  ride: NO_LENGTH_WITHHELD,
})

/**
 * The dots a sport's weekly points draw: the efforts that led a window, each counted once however many windows it led
 * (the same count the chart makes, before its units).
 */
export function dotCount(points: readonly TrendPoint[], sport: 'run' | 'ride'): number {
  const led = new Set<number>()
  for (const point of points) {
    const [atMs, wkg] = LEADER[sport](point)
    if (atMs !== null && wkg !== null) led.add(atMs)
  }
  return led.size
}

/** The start of the effort that led a point's window, and its value, for each sport. */
const LEADER: Record<'run' | 'ride', (point: TrendPoint) => [number | null, number | null]> = {
  run: (point) => [point.runAtMs, point.runWkg],
  ride: (point) => [point.rideAtMs, point.rideWkg],
}

/**
 * The trailing window of a trend point for a period of rangeDays (null for all time): a third of the
 * period, between one week and six, so a six-week period is judged in two-week windows.
 */
export function trendWindowDays(rangeDays: number | null): number {
  if (rangeDays === null) return DEFAULT_WINDOW_DAYS
  return Math.max(MIN_WINDOW_DAYS, Math.min(DEFAULT_WINDOW_DAYS, Math.round(rangeDays / 3)))
}

export { weekEndMs } from '../calendar'

/**
 * How many points have a run or a ride value. A trend needs at least two to be drawn. Kept apart
 * from trend.ts so the main thread can use it without loading the analysis.
 */
export function weeksWithValue(points: readonly TrendPoint[]): number {
  return points.filter((point) => point.runWkg !== null || point.rideWkg !== null).length
}
