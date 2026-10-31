/**
 * Bands recorded when the held-out configurations merged. A held-out test asserts these; it does not
 * move them. A re-pin is its own commit, "held-out re-pinned: <reason>", with a new row in
 * docs/design/heldout-log.md (heldOutLog.node.test.ts checks that the last row names the hash of heldOut.ts and this file together).
 */

/** Spread of the same-heart-rate unit about the weekly level, log units: 8 seeds of 78 weeks, pooled. */
export const UNIT_SPREAD_BANDS = {
  D: [0.034, 0.047],
  E: [0.032, 0.045],
  F: [0.034, 0.047],
} as const

/**
 * The fitness monitor (D2) on eight libraries of 156 weeks of each configuration's own sport (D and E run, F ride),
 * as heldOut.heldout.sim.test.ts builds them. Observed: D 0.125, E 0, F 0.5 slips an athlete-year in the 104 weeks
 * before a loss. Eight libraries is two alarms for D, so the bands are wide; E has 11 to 28 steady runs in 130 weeks
 * (cadence-less GPX, a wide wander) and stays at "not enough evidence", so it is silent by being blind.
 */
export const FALSE_ALARM_BANDS = { D: [0, 0.3], E: [0, 0.1], F: [0.2, 0.8] } as const

/**
 * Share of those libraries that declare a slip within 26 weeks of a planted 8% loss at week 104. Observed: D 0.5,
 * E 0, F 0.75 (steps of 0.125). E sees nothing for the reason above.
 */
export const POWER_BANDS = { D: [0.25, 0.75], E: [0, 0.12], F: [0.5, 1] } as const
