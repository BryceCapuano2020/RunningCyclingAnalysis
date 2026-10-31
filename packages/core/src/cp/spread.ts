import type { CriticalPowerFit } from '../types'

/*
 * The spread drawn beside a threshold. It is one-sided because the error is: a best that was not quite all-out puts the
 * fit under the truth, so the truth lies above the fit by an allowance that grows as the effort behind it is less clearly
 * hard, and below it only by the regression error. Both ends are in the fit's unit, gross metabolic W/kg, so a pace is read
 * from them as the fit is.
 */

/**
 * The share of the threshold the truth lies above the fit at a heart-rate share of 1 (an effort at the reference's own
 * level), and how much more it adds per unit the share falls short of 1. Fitted to the synthetic harness
 * (effort/gate.passing.sim.test.ts): over the 1,085 fits of libraries the gate let through (hard, sparse and hard-heavy training,
 * test days, low-maximum and hot-day athletes, runs and rides), the distance of the truth above the fit regressed on
 * the share is 0.037 + 0.386 x (1 - share), and the 67th percentile of what is left is 0.0074 more. With both added the
 * band held the truth in 67% of those fits: in-sample, since the allowance was fitted to the same fits, so it is not a coverage claim
 * for athletes outside the harness.
 */
export const ALLOWANCE_BASE = 0.044
export const ALLOWANCE_PER_SHORTFALL = 0.386

/** The share assumed where the effort was not checked: the hard line itself. */
export const UNCHECKED_SHARE = 0.9

export interface CpBand {
  low: number
  high: number
}

/**
 * The band of a threshold: down by its regression error, up by the allowance for how hard the effort behind it was
 * (`share` of the reference heart rate; null where it was not checked, which allows what the hard line allows).
 */
export function cpBand(fit: Pick<CriticalPowerFit, 'cp' | 'cpSe'>, share: number | null): CpBand {
  const shortfall = Math.max(0, 1 - (share ?? UNCHECKED_SHARE))
  return {
    low: fit.cp - fit.cpSe,
    high: fit.cp * (1 + ALLOWANCE_BASE + ALLOWANCE_PER_SHORTFALL * shortfall),
  }
}
