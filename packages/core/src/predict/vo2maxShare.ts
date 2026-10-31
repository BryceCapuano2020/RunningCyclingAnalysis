/*
 * How much a run counts toward the heart-rate VO2max, by the share of the reference heart rate its window was held at.
 * A hard cut at one share (a run at 84.9% leaves, one at 85.1% stays at full weight) makes the estimate, and every race
 * time carried from it, jump when a run drifts across the line or the reference moves a beat. A ramp makes it move with
 * them. Below the ramp the intercept of Swain's relation is a larger part of the estimate and its error grows; near the
 * maximum heart rate plateaus, so the full weight is a floor, not a target.
 */

/** A window held under this share of the reference counts for nothing. */
export const VO2MAX_SHARE_ZERO = 0.8

/** A window held at or over this share counts in full. */
export const VO2MAX_SHARE_FULL = 0.9

/** The weight of a window held at `share` of the reference heart rate: 0 under VO2MAX_SHARE_ZERO, 1 from VO2MAX_SHARE_FULL, linear between. */
export function shareWeight(share: number): number {
  if (!(share > VO2MAX_SHARE_ZERO)) return 0
  if (share >= VO2MAX_SHARE_FULL) return 1
  return (share - VO2MAX_SHARE_ZERO) / (VO2MAX_SHARE_FULL - VO2MAX_SHARE_ZERO)
}

/** A value and how much it counts. */
export interface Weighted {
  value: number
  weight: number
}

/**
 * The weighted median: the lowest value at which the weights up to it reach half of all of them. Equal weights give
 * the ordinary median, taking the mean of the two middle values when the count is even.
 */
export function weightedMedian(items: readonly Weighted[]): number {
  const sorted = items.filter((item) => item.weight > 0).sort((a, b) => a.value - b.value)
  const half = sorted.reduce((sum, item) => sum + item.weight, 0) / 2
  let reached = 0
  for (const [i, item] of sorted.entries()) {
    reached += item.weight
    if (Math.abs(reached - half) < 1e-9 && i + 1 < sorted.length) {
      return (item.value + sorted[i + 1]!.value) / 2
    }
    if (reached > half) return item.value
  }
  return Number.NaN
}
