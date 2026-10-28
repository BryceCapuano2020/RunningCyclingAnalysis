import { GRADE_HALF_SPAN_S } from './metabolic/grade'
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
export const MARATHON_M = 42_195

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

/**
 * A best effort is uneven, and sets only a floor on the threshold, when it is at least this long, s,
 * and a shorter best from the same ride, at least UNEVEN_NESTED_FRACTION as long, lies inside its window
 * while the rest of that window averages under UNEVEN_REST_FRACTION of the shorter best. An evenly paced
 * all-out 20 minutes leaves its rest at about 0.9 of its 10 minute best, so 0.85 is below every even pace
 * and above a rest that a hard effort set in easier riding leaves.
 */
export const UNEVEN_MIN_S = 600
export const UNEVEN_NESTED_FRACTION = 0.4
export const UNEVEN_REST_FRACTION = 0.85

/**
 * The ride durations, s, a cross-sport equivalence is worked out at: 3 minutes up to an hour. The
 * analysis prices these in every combine, so each added here costs one sort of the 4,000 draws there.
 */
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

/**
 * The durations, s, the age grade by duration is drawn at: every curve duration from EQUIVALENCE_MIN_S up
 * to the curve's longest, 3 hours. The ride's equivalents beyond EQUIVALENCE_DURATIONS_S are priced by
 * the page that draws them, not by every combine.
 */
export const PROFILE_DURATIONS_S: readonly number[] = DURATIONS_S.filter(
  (durationS) => durationS >= EQUIVALENCE_MIN_S,
)

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
 * Climb rate, m/s, held over CLIMB_RATE_WINDOW_S, at which altitude is taken to be wrong and its
 * grade is left out. The vertical-kilometre record climbs under 0.6 m/s for half an hour, and the
 * best cyclists hold about 0.5 m/s, so 1 m/s for half a minute is an altitude error, not a climb.
 */
export const MAX_CLIMB_RATE_MS = 1.0

/** Seconds over which the climb rate is measured: the span of smoothGrade's rise and run. */
export const CLIMB_RATE_WINDOW_S = 2 * GRADE_HALF_SPAN_S

/**
 * Seconds, centred on each second, over which a file's speed and its recorded distance are compared
 * (quality/agreement.ts): the span a grade is measured over, so a disagreement that could bend a
 * grade is seen whole.
 */
export const AGREEMENT_WINDOW_S = 2 * GRADE_HALF_SPAN_S
/** Metres both streams must cover over the window, 0.5 m/s: below it the athlete is standing still. */
export const AGREEMENT_MIN_MOVING_M = 15
/**
 * The streams disagree over a window when they differ by at least AGREEMENT_MIN_DIFFERENCE_M, 1 m/s,
 * and one covers more than AGREEMENT_MAX_RATIO times the other. On a corpus of 1,275 outdoor FIT
 * runs this flags about one in ten, among them steps where a watch's speed reads twice its GPS
 * track, and no GPX file, whose two streams are one. A ratio of 1.5 flags twice as many flat runs;
 * a 60 m difference misses the steps.
 */
export const AGREEMENT_MIN_DIFFERENCE_M = 30
export const AGREEMENT_MAX_RATIO = 2

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

/**
 * Heart rate that cannot be right is set aside. A best effort of at least HR_SET_ASIDE_MIN_S held at
 * or above threshold drives heart rate toward its maximum, so a window mean under
 * HR_SET_ASIDE_FLOOR of the sport's reference heart rate is a sensor fault, not the athlete.
 */
export const HR_SET_ASIDE_MIN_S = 600
export const HR_SET_ASIDE_FLOOR = 0.7

/** The running races predicted, m: 5 km, 10 km, the half marathon and the marathon. */
export const RUN_RACE_DISTANCES_M = [5_000, 10_000, HALF_MARATHON_M, MARATHON_M] as const

/**
 * Riegel's fatigue exponent: time grows as distance to this power (Riegel 1977, Runner's World). Vickers &
 * Vertosick (2016, BMC Sports Sci Med Rehabil 8:26) found 1.07 well calibrated up to the half marathon in
 * 2,303 recreational runners, so it is used as is, not fitted to bests that may not have been all-out.
 */
export const RIEGEL_EXPONENT = 1.07
/** A best predicts a race at most this many times its own distance, since the error grows with the ratio. */
export const RIEGEL_MAX_RATIO = 10

/**
 * The heart-rate estimate of VO2max uses windows of at least this long, s, at or above this share of the
 * running reference heart rate, from at least this many runs. Below the share, the intercept of Swain's
 * relation is a larger part of the estimate and its error grows; near the maximum, heart rate plateaus,
 * so the share is a floor, not a target.
 */
export const VO2MAX_MIN_WINDOW_S = 600
export const VO2MAX_MIN_HR_SHARE = 0.85
export const VO2MAX_MIN_RUNS = 2

/**
 * The spread of a race prediction, as a standard deviation of log time, by race. The marathon's is
 * Vickers & Vertosick's model 1 validation error (about 15 min at 3:40); the shorter races' are a
 * judgement, scaled down with distance, since no comparable recreational validation was found.
 */
export const RACE_LOG_SD: Record<(typeof RUN_RACE_DISTANCES_M)[number], number> = {
  5_000: 0.04,
  10_000: 0.045,
  [HALF_MARATHON_M]: 0.055,
  [MARATHON_M]: 0.07,
}
/** The share of outcomes the range shows: from the 10th to the 90th percentile. */
export const RACE_RANGE_Z = 1.2816

/**
 * Output at the same heart rate (docs/research/same-heart-rate.md). Each week fits output on heart
 * rate over the blocks of the trailing windowDays, and reports it at a reference heart rate kept for
 * the whole period. A week reports only with at least minBlocks blocks from minActivities activities
 * in minWeeks different weeks, and heart rate spread of at least minSpreadBpm (standard deviation).
 * At most maxBlocks blocks from at most maxActivities activities enter a fit, and at most maxWeeks
 * weeks are reported. The reference heart rate is the median of the library's newest referenceWeeks
 * weeks of blocks, so it does not move with the period. A change is only said with minReportedWeeks
 * reporting weeks. The 90% interval is built from the spread of `draws` resamples of the
 * activities, seeded with `seed`, and widened for few activities (see theilSen.ts).
 */
export const SAME_HEART_RATE = {
  windowDays: 28,
  minBlocks: 8,
  minActivities: 6,
  minWeeks: 2,
  minSpreadBpm: 5,
  maxBlocks: 48,
  maxActivities: 24,
  maxWeeks: 52,
  referenceWeeks: 52,
  minReportedWeeks: 4,
  referenceStepBpm: 5,
  draws: 200,
  seed: 1,
} as const

/**
 * The moving-time distributions a digest keeps, one per measure: bin width in the measure's unit
 * (bpm, W, m/s), and the highest bin index a sample can fall in. A sample past it is not counted.
 * The quality masks cap each measure: a heart-rate spike is above 230 bpm, a power spike above
 * 2,000 W and a running speed spike above 12.5 m/s, so no valid sample reaches the limits below.
 */
export const DISTRIBUTION_BINS = {
  heartRate: { width: 1, maxBin: 255 },
  power: { width: 5, maxBin: 400 },
  speed: { width: 0.05, maxBin: 250 },
} as const
export type DistributionMeasure = keyof typeof DISTRIBUTION_BINS

/**
 * Durability: the best output at each of DURABILITY_DURATIONS_S, in windows that start after at least
 * each of DURABILITY_AFTER_S seconds of moving time (1, 1.5 and 2 hours). See docs/research/durability.md.
 */
export const DURABILITY_AFTER_S = [3600, 5400, 7200] as const
export const DURABILITY_DURATIONS_S = [300, 1200] as const

/**
 * Steady-effort drift: the output per heart-rate ratio of the first half against the second half of
 * an activity's moving time after the warm-up. It is reported only for a steady effort, which is one
 * whose 30 s outputs vary little (coefficient of variation at most maxCv for the sport) and whose two
 * halves hold about the same output (means within maxHalfGap of each other). Half the blocks of each
 * half must have a valid output and heart rate. See docs/research/durability.md.
 */
export const DRIFT = {
  minMovingS: 3600,
  warmupS: 600,
  blockS: 30,
  /** Fraction of a block's seconds that must have a valid output and heart rate for it to count. */
  minBlockCoverage: 0.8,
  /** Fraction of a half's blocks that must count. */
  minHalfCoverage: 0.8,
  maxCv: { run: 0.15, ride: 0.25 },
  maxHalfGap: 0.1,
} as const
