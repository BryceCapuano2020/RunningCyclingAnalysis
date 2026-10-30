/**
 * Bands recorded when the held-out configurations merged. A held-out test asserts these; it does not
 * move them. A re-pin is its own commit, "held-out re-pinned: <reason>", with a new row in
 * docs/design/heldout-log.md (heldOut.heldout.test.ts checks that the last row names this file's hash).
 */

/** Spread of the same-heart-rate unit about the weekly level, log units: 8 seeds of 78 weeks, pooled. */
export const UNIT_SPREAD_BANDS = {
  D: [0.034, 0.047],
  E: [0.032, 0.045],
  F: [0.034, 0.047],
} as const
