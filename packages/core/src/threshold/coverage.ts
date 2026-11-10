/*
 * The coverage of a threshold's range. A `ThresholdEstimate` carries its `low` and `high` as 10th and 90th percentiles, and the
 * grades and the lead the page states are 5th to 95th (the anchor's spread is a 5th to 95th one, and the page calls the range 90%).
 * Every range that is built from a threshold's ends goes through here, so a sport's grade range and the lead's agree in coverage.
 */

import { Z_P90, Z_P95 } from '../math'

export { Z_P90, Z_P95 }

/** How much farther the 5th and 95th percentiles sit from the centre than the 10th and 90th, on a normal. */
export const P90_TO_P95 = Z_P95 / Z_P90

/**
 * An end of a threshold's range (its `low` or `high`, a 10th or 90th percentile) moved out to the 5th or 95th on the log scale.
 * The end on the centre's side is kept on its side, and an end at the centre stays there.
 */
export function endAtFiveNinetyFive(centre: number, end: number): number {
  return centre * (end / centre) ** P90_TO_P95
}
