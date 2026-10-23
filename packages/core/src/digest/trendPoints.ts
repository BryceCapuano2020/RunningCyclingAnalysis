import type { TrendPoint } from './trend'

/**
 * How many points have a run or a ride value. A trend needs at least two to be drawn. Kept apart
 * from trend.ts so the main thread can use it without loading the analysis.
 */
export function weeksWithValue(points: readonly TrendPoint[]): number {
  return points.filter((point) => point.runWkg !== null || point.rideWkg !== null).length
}
