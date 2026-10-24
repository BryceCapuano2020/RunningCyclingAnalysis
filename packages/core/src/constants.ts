import { METRES_PER_KM, METRES_PER_MILE } from './units/convert'

/** Durations, in seconds, at which every duration curve is evaluated. */
export const DURATIONS_S = [
  5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200,
  10800,
] as const

/** Distances, m, at which a run's fastest time is recorded: 1 km, 1 mile, 5 km and 10 km. */
export const RUN_RECORD_DISTANCES_M = [
  METRES_PER_KM,
  METRES_PER_MILE,
  5 * METRES_PER_KM,
  10 * METRES_PER_KM,
] as const
export type RunRecordDistanceM = (typeof RUN_RECORD_DISTANCES_M)[number]
/**
 * Most splits one run may have in each unit, counting a partial split. A run over the limit has
 * none in that unit. 500 is a 500 km run, and 320 miles is about 515 km.
 */
export const MAX_KM_SPLITS = 500
export const MAX_MILE_SPLITS = 320

/** The duration, s, that the headline and the fitness trend describe: 20 minutes. */
export const HEADLINE_DURATION_S = 1200

export const DAY_MS = 86_400_000

export const G = 9.80665
/** Air density at 15 C, sea level, kg/m^3. */
export const RHO_AIR = 1.225
export const DRIVETRAIN_EFFICIENCY = 0.975

/** Resting metabolic rate, W/kg (3.5 ml O2/kg/min at 20.9 J/ml). */
export const RESTING_W_PER_KG = 1.22

/**
 * Minetti et al. 2002 cost of running on the flat, J/kg/m: the intercept of their fit. Whether it
 * is net or gross is unverified (docs/validation/physiology.md §2).
 */
export const MINETTI_FLAT_COST = 3.6

/**
 * Level correction, J/kg/m, added to Minetti's cost at every gradient. It takes the flat cost to
 * 3.9, the centre of the research's parameter sources (docs/research/headline-bias.md §2 and §3).
 * That centre rests partly on unverified values, and its Margaria term equals ACSM's validation
 * slope. Without Margaria the centre is 3.73 (headline-bias.md §3). The shift is additive, not a
 * scale: a uniform 1.083 scale would overshoot ACSM at +10% grade by about 6%, the additive form by
 * about 3%. Downhill is unvalidated: the additive form adds 11%, 14% and 17% at −5%, −10% and −20%
 * grade, against about 8% for a scale. Only −5% has a reference (physiology.md §10.6).
 */
export const RUN_COST_CORRECTION = 0.3

/** Cost of running on the flat, J/kg/m, with the level correction. Used by pace conversions. */
export const FLAT_RUN_COST = MINETTI_FLAT_COST + RUN_COST_CORRECTION

/**
 * Population priors: gross efficiency of cycling, and a multiplicative individual running economy
 * on the corrected cost. Efficiency sd 0.015 keeps about 95% of draws within 18.5 to 24.5%, which
 * covers the 18 to 23.5% range of measured studies (docs/research/cycling-efficiency.md §5).
 * Economy sd 0.08 is the between-person spread chosen in headline-bias.md §3, between the 5 to 6%
 * implied by Lacour & Bourdin and the 11% spread of the central values. Bounds are the mean plus or
 * minus 3 sd.
 */
export const PRIORS = {
  grossEfficiency: { mean: 0.215, sd: 0.015, min: 0.17, max: 0.26 },
  runEconomyScale: { mean: 1.0, sd: 0.08, min: 0.76, max: 1.24 },
} as const

export const DEFAULT_BIKE_MODEL = { cda: 0.32, crr: 0.005 } as const

/** Virtual power is trusted only where gravity dominates aero drag. */
export const MIN_CLIMB_GRADE = 0.03

/**
 * Extra standard error on ln(kappa) for the assumption that heart rate maps to
 * metabolic power identically in both sports.
 */
export const HR_MODEL_DISCREPANCY = 0.05
