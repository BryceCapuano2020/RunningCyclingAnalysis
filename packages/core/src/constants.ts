/** Durations, in seconds, at which every duration curve is evaluated. */
export const DURATIONS_S = [
  5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200,
  10800,
] as const

/** The duration, s, that the headline and the fitness trend describe: 20 minutes. */
export const HEADLINE_DURATION_S = 1200

export const DAY_MS = 86_400_000

export const G = 9.80665
/** Air density at 15 C, sea level, kg/m^3. */
export const RHO_AIR = 1.225
export const DRIVETRAIN_EFFICIENCY = 0.975

/** Resting metabolic rate, W/kg (3.5 ml O2/kg/min at 20.9 J/ml). */
export const RESTING_W_PER_KG = 1.22

/** Minetti et al. 2002 net cost of running on the flat, J/kg/m. */
export const FLAT_RUN_COST = 3.6

/**
 * Population priors. Gross efficiency of cycling and a multiplicative scale on
 * the Minetti running cost (individual running economy).
 */
export const PRIORS = {
  grossEfficiency: { mean: 0.215, sd: 0.012, min: 0.18, max: 0.25 },
  runEconomyScale: { mean: 1.0, sd: 0.06, min: 0.82, max: 1.18 },
} as const

export const DEFAULT_BIKE_MODEL = { cda: 0.32, crr: 0.005 } as const

/** Virtual power is trusted only where gravity dominates aero drag. */
export const MIN_CLIMB_GRADE = 0.03

/**
 * Extra standard error on ln(kappa) for the assumption that heart rate maps to
 * metabolic power identically in both sports.
 */
export const HR_MODEL_DISCREPANCY = 0.05
