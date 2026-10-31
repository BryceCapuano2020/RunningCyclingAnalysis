/*
 * How much a run counts toward the heart-rate VO2max, by the share of the reference heart rate its window was held at.
 * A step from nothing to full weight at one share (a run at 84.9% leaves, one at 85.1% stays at full weight) makes the
 * estimate, and every race time carried from it, jump when a run drifts across the line or the reference moves a beat.
 * A ramp up from the old line makes it move with them, and a window under the line still counts for nothing. Whether there
 * is an estimate is the old rule's: at least two runs at or over the line. Below the ramp the intercept of Swain's relation
 * is a larger part of the estimate and its error grows; near the maximum heart rate plateaus, so the full weight is a
 * floor, not a target.
 */

/** A window held under this share of the reference counts for nothing: the line the estimate always had. */
export const VO2MAX_SHARE_ZERO = 0.85

/** A window held at or over this share counts in full. */
export const VO2MAX_SHARE_FULL = 0.9

/**
 * What a window on the line counts for: half. The ramp climbs from here to 1 at VO2MAX_SHARE_FULL. A window on the line is
 * one the estimate has always counted in full, so it is a run for the count and for whether there is an estimate at all,
 * and it counts for half so that a run drifting from the line up does not take over the median from the others: from a
 * lighter floor (0.01) the weights swing the weighted median further than the old equal ones did, at the few runs
 * a treadmill-heavy library has (the generated libraries of vo2max.gate.sim.test.ts).
 */
export const MIN_SHARE_WEIGHT = 0.5

/**
 * The weight of a window held at `share` of the reference heart rate: 0 under VO2MAX_SHARE_ZERO, then a straight line
 * from MIN_SHARE_WEIGHT there to 1 from VO2MAX_SHARE_FULL. A window has weight exactly when the old gate counted it.
 */
export function shareWeight(share: number): number {
  if (!(share >= VO2MAX_SHARE_ZERO)) return 0
  if (share >= VO2MAX_SHARE_FULL) return 1
  const ramp = (share - VO2MAX_SHARE_ZERO) / (VO2MAX_SHARE_FULL - VO2MAX_SHARE_ZERO)
  return MIN_SHARE_WEIGHT + (1 - MIN_SHARE_WEIGHT) * ramp
}

/** A value and how much it counts. */
export interface Weighted {
  value: number
  weight: number
}

/**
 * The weighted median, interpolated: each value sits at the middle of its share of the total weight, and the median is
 * read by a straight line between the two middles either side of half. Equal weights give the ordinary median (the mean of
 * the two middle values when the count is even), and a weight that grows or shrinks moves the answer continuously, where
 * the plain weighted median jumps to the next value. NaN without weight.
 */
export function weightedMedian(items: readonly Weighted[]): number {
  const sorted = items.filter((item) => item.weight > 0).sort((a, b) => a.value - b.value)
  const total = sorted.reduce((sum, item) => sum + item.weight, 0)
  if (!(total > 0)) return Number.NaN
  let before = 0
  let previous: { at: number; value: number } | null = null
  for (const item of sorted) {
    const at = (before + item.weight / 2) / total
    if (at >= 0.5) {
      if (previous === null) return item.value
      return (
        previous.value + ((0.5 - previous.at) / (at - previous.at)) * (item.value - previous.value)
      )
    }
    previous = { at, value: item.value }
    before += item.weight
  }
  return previous!.value
}
