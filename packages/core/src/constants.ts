import { METRES_PER_KM, METRES_PER_MILE } from './units/convert'

/** Binary sizes, for byte limits and for telling people how large a file may be. */
export const MIB = 1024 ** 2
export const GIB = 1024 ** 3

/** Durations, in seconds, at which every duration curve is evaluated. */
export const DURATIONS_S = [
  5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200,
  10800,
] as const

/** A half marathon, m: 21.0975 km. */
export const HALF_MARATHON_M = 21_097.5

/**
 * Distances, m, at which a run's fastest time is recorded: 1 km, 1 mile, 5 km, 10 km and a half
 * marathon. A run keeps the time at each one it covers.
 */
export const RUN_RECORD_DISTANCES_M = [
  METRES_PER_KM,
  METRES_PER_MILE,
  5 * METRES_PER_KM,
  10 * METRES_PER_KM,
  HALF_MARATHON_M,
] as const
export type RunRecordDistanceM = (typeof RUN_RECORD_DISTANCES_M)[number]

/**
 * The open men's world-record flat speed, m/s, at the durations a run's best is held over, from the
 * event world records: 100 m in 9.58 s, 400 m in 43.03 s, 800 m, 1,500 m, 5,000 m, 10,000 m, the half
 * marathon and the marathon. A best faster than its ceiling is not a possible effort. Between two
 * entries the ceiling is interpolated, and beyond the ends it holds the end value; see runCeilingSpeed.
 */
export const RUN_WORLD_RECORD_SPEEDS: readonly { durationS: number; speedMs: number }[] = [
  // 5 s and 10 s: the sprint limit.
  { durationS: 5, speedMs: 12.2 },
  { durationS: 10, speedMs: 12.2 },
  // 100 m in 9.58 s.
  { durationS: 20, speedMs: 10.44 },
  // 400 m in 43.03 s.
  { durationS: 43, speedMs: 9.3 },
  // 800 m.
  { durationS: 101, speedMs: 7.93 },
  // 1,500 m.
  { durationS: 206, speedMs: 7.28 },
  // 5,000 m.
  { durationS: 755, speedMs: 6.62 },
  // 10,000 m.
  { durationS: 1571, speedMs: 6.37 },
  // The half marathon.
  { durationS: 3450, speedMs: 6.12 },
  // The marathon.
  { durationS: 7235, speedMs: 5.83 },
]
/**
 * Most splits one run may have in each unit, counting a partial split. A run over the limit has
 * none in that unit. 500 is a 500 km run, and 320 miles is about 515 km.
 */
export const MAX_KM_SPLITS = 500
export const MAX_MILE_SPLITS = 320

/** The duration, s, that the headline and the fitness trend describe: 20 minutes. */
export const HEADLINE_DURATION_S = 1200

/** The shortest and longest efforts, s, the critical-power fit uses: 3 to 20 minutes. */
export const CP_FIT_MIN_S = 180
export const CP_FIT_MAX_S = 1200
/**
 * How far short of its longest effort a fit window may stop and still reach it: 5%, so the window
 * must reach 1140 s. The curve holds durations of 900 s and 1200 s here, so in practice the fit needs
 * its 20 minute effort.
 */
export const CP_FIT_REACH_TOLERANCE = 0.05
/**
 * The least work a critical-power fit may show. The floors sit well below published work capacities,
 * even for untrained athletes: the review brief quotes cycling W' of about 10 to 25 kJ and running D'
 * of about 100 to 300 m, from the model in Jones et al. (2010) and Skiba et al. (2012), cited in
 * docs/research/evolving-capability.md section 4 (whose DOIs that note flags as unverified). The
 * floors refuse only fits indistinguishable from flat. On the fitted line they put the 20 minute value at
 * least W'/1200 s above cp (about 1% for a 250 W rider, 0.33% for a runner at 3.5 m/s), but the efforts
 * themselves can sit closer to cp than that, so a kept threshold can be close to the best 20 minutes. Running D' becomes energy per kilogram at the flat cost of running (FLAT_RUN_COST).
 */
export const W_PRIME_FLOOR_J = 3_000
export const D_PRIME_FLOOR_M = 15

/** The ride durations, s, a cross-sport equivalence is worked out at: 3 minutes up to an hour. */
export const EQUIVALENCE_DURATIONS_S: readonly number[] = [
  180,
  300,
  600,
  HEADLINE_DURATION_S,
  1800,
  3600,
]
/** The shortest ride, s, that an equivalence is worked out for. */
export const EQUIVALENCE_MIN_S = EQUIVALENCE_DURATIONS_S[0]!

export const DAY_MS = 86_400_000
/** A calendar month on average: 365.25 days over twelve months. */
export const DAYS_PER_MONTH = 30.4375

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

/**
 * The heart-rate blocks: each is this many seconds of steady effort, averaged for the check, and
 * the first HR_SKIP_S seconds of an activity are left out, as warm-up and settling.
 */
export const HR_BLOCK_S = 300
export const HR_SKIP_S = 600
