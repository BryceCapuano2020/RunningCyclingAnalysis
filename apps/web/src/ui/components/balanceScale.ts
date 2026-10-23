/** How far ahead a sport sits at the edge of a meter: 30%. Larger leads are drawn at the edge. */
export const BALANCE_SPAN = 0.3

/** The meter's track, in its own units, and how far the dot stops inside each end of it. */
export const METER_TRACK = 320
const METER_INSET = 8

/**
 * Where a ratio of running over cycling sits on the meter, from -1 (cycling at the far edge) to 1
 * (running at the far edge), clamped. Cycling over running is the inverse of the ratio, so a lead
 * of either sport is the same distance from even in log terms.
 */
export function balanceOffset(ratio: number): number {
  const gap = ratio >= 1 ? ratio - 1 : -(1 / ratio - 1)
  return Math.max(-1, Math.min(1, gap / BALANCE_SPAN))
}

/**
 * Where a ratio sits along a meter's track, as a fraction of its width: 0 at the cycling end, 0.5 at
 * even and 1 at the running end. The dot stops METER_INSET units inside each end.
 */
export function meterFraction(ratio: number): number {
  return 0.5 + balanceOffset(ratio) * (0.5 - METER_INSET / METER_TRACK)
}

/**
 * The start and width of a band across a meter, from its low and high edges. A band is never
 * narrower than its height, so its rounded ends stay round; a widened band keeps its middle.
 */
export function bandSpan(
  low: number,
  high: number,
  height: number,
): { start: number; width: number } {
  const width = Math.max(high - low, height)
  return { start: (low + high) / 2 - width / 2, width }
}
