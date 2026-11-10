import { FLAT_RUN_COST, PRIORS } from '../constants'
import { CYCLING_WORLD_CLASS_HOUR_WKG } from '../digest/rideAnchor'
import { HOUR_AGREEMENT } from '../threshold/constants'
import { DURATION_TABLES, runDurationRatio } from '../threshold/durationTables'

/*
 * The figures the Method page quotes, worked out from the constants and functions the analysis applies, so the page cannot say a
 * number the code does not use. The web words them and does no arithmetic of its own on a constant.
 */

/** The prior mean of gross efficiency, as a percent (21.5). */
export const GROSS_EFFICIENCY_PERCENT = PRIORS.grossEfficiency.mean * 100

const spreadPercent = (prior: { mean: number; sd: number }) =>
  Math.round((prior.sd / prior.mean) * 100)

/** How far gross efficiency varies between people, as a whole percent of its mean. */
export const EFFICIENCY_SPREAD_PERCENT = spreadPercent(PRIORS.grossEfficiency)

/** How far running economy varies between people, as a whole percent of its mean. */
export const ECONOMY_SPREAD_PERCENT = spreadPercent(PRIORS.runEconomyScale)

/** The cost of running on the flat, J/kg/m, as the model prices it (`FLAT_RUN_COST`), for the Method page to quote and not to work with. */
export const FLAT_RUN_COST_J_PER_KG_M = FLAT_RUN_COST

/** The share of an hour that a second hour must be within to back it as a floor, as a whole percent (`HOUR_AGREEMENT`). */
export const HOUR_AGREEMENT_PERCENT = Math.round(HOUR_AGREEMENT * 100)

/**
 * How far above the hour's oxygen cost the running table puts an all-out effort of `minutes`, as a whole percent. It is the
 * ratio the estimate applies (`runDurationRatio`, Daniels and Gilbert's share of VO2max), a ratio of oxygen cost and not of
 * the energy rate: the energy rate is linear in speed where the cost is not, so the same effort sits fewer percent above the
 * hour in energy rate.
 */
export function runOxygenExcessPercent(minutes: number): number {
  return Math.round((runDurationRatio(minutes * 60) - 1) * 100)
}

/** The shortest effort each sport's threshold reads, seconds: 3 min for a ride, 8 for a run (`DURATION_TABLES`). */
export const THRESHOLD_SHORTEST_S = {
  ride: DURATION_TABLES.ride.shortestS,
  run: DURATION_TABLES.run.shortestS,
} as const

/** A ride's threshold as a whole percent of an all-out best of this length (95 for 20 min, as in the FTP test). */
export function rideThresholdPercentOf(durationS: number): number {
  return Math.round(DURATION_TABLES.ride.threshold(100, durationS))
}

/** The best riders' hour, W/kg, by sex: the cycling anchor (`CYCLING_WORLD_CLASS_HOUR_WKG`). */
export const CYCLING_ANCHOR_WKG = CYCLING_WORLD_CLASS_HOUR_WKG
