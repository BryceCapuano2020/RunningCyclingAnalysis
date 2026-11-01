/**
 * The usual spread of a measure's readings, drawn as a band on the activity's chart and listed as its typical range
 * in the summary: the readings between the same two percentiles, so the two never give two ranges for one stretch.
 */

/** The share of readings cut from each end of the usual spread. */
export const SPREAD_CUT = 0.1

/** The spread in words, such as "10th to 90th percentile", from its cut. */
export const SPREAD_WORDS = `${Math.round(SPREAD_CUT * 100)}th to ${Math.round((1 - SPREAD_CUT) * 100)}th percentile`

/** The lowest and highest readings of a sorted run of readings that lie inside the usual spread, or null with none. */
export function usualSpread(sorted: ArrayLike<number>): { low: number; high: number } | null {
  const n = sorted.length
  if (n === 0) return null
  return {
    low: sorted[Math.floor(n * SPREAD_CUT)]!,
    high: sorted[Math.max(0, Math.ceil(n * (1 - SPREAD_CUT)) - 1)]!,
  }
}
