/*
 * The numbers of the threshold estimate (docs/design/threshold.md), each tuned on the synthetic riders of
 * threshold.sim.test.ts. They live here and not in core's constants.ts, which has no room.
 */

/** The shortest best that says anything about a ride's threshold; under this the sprint dominates. */
export const RIDE_SHORTEST_EFFORT_S = 180
/**
 * The shortest best that says anything about a run's threshold. The 3 to 7 min bests of training runs are strides, hills and GPS
 * noise, not races, and Daniels' curve describes races: scaled from them, a run's threshold reads fast (docs/design/threshold.md,
 * "Runs"). From 8 min a best is a sustained run and the curve holds.
 */
export const RUN_SHORTEST_EFFORT_S = 480

// Duration ratio: the best a rider can hold for a time, as a multiple of threshold, for a rider who gave it all.
/** The ratio changes formula at this many minutes, with no step: 1.015 + 0.76 / 20 is 1.053. */
export const RATIO_KNEE_MIN = 20
/** Up to the knee: base + perMinute / minutes, the 95% rule at 20 min (1.053) and the 90% rule at 8 min (1.11). */
export const RATIO_SHORT = { base: 1.015, perMinute: 0.76 } as const
/** Past the knee: atKnee - fall * ln(minutes / knee) / ln(span), which is 1.00 at span * knee = 60 min and falls on after. */
export const RATIO_LONG = { atKnee: 1.053, fall: 0.053, span: 3 } as const
/** How far the ratio varies between riders, as a share: smallest at the knee, growing with the log of the distance either side. */
export const RATIO_SPREAD = { atKnee: 0.025, perLog: 0.02 } as const

// Running duration table: Daniels and Gilbert's share of VO2max a runner holds for m minutes,
// pct(m) = floor + slow * exp(-slow.rate * m) + fast * exp(-fast.rate * m). The ratio is pct(minutes) over pct(60).
export const RUN_SHARE = {
  floor: 0.8,
  slow: { weight: 0.1894393, rate: 0.012778 },
  fast: { weight: 0.2989558, rate: 0.1932605 },
} as const
/**
 * Daniels and Gilbert's oxygen cost of running at v metres a minute, ml/kg/min: constant + linear * v + square * v^2. It is
 * convex in speed, where the run curve's gross metabolic W/kg is linear in it, so a share of VO2max is not a share of W/kg.
 */
export const RUN_VO2 = { constant: -4.6, linear: 0.182258, square: 0.000104 } as const
/** The hour: the length at which the ratio is 1 for both sports, and from which an effort sets a floor under the answer. */
export const HOUR_S = 3600
/**
 * An hour backs a floor when the next hour down in the window is within this share of it, or when it is no higher than the power
 * estimate's own 90th percentile. The best hour is the floor if backed; a lone hour above that is one file nothing backs, and the
 * second-best hour is the floor instead if the third (or the estimate) backs it the same way, else there is none.
 */
export const HOUR_AGREEMENT = 0.04

// Power estimate: one estimate per ride, a robust mean of them.
/** A ride's weight halves every this many days back from the newest activity. */
export const HALF_LIFE_DAYS = 42
/** A ride this share of the second-strongest ride's estimate gets half weight, over this width. */
export const NEAR_TOP_CENTRE = 0.96
export const NEAR_TOP_WIDTH = 0.015
/** Watts estimated without a power meter count for this much of a measured ride. */
export const ESTIMATED_WEIGHT = 0.4
/** The power estimate's relative error never reads under this, however many rides agree. */
export const POWER_MIN_ERROR = 0.025

// Tukey biweight mean.
export const BIWEIGHT_C = 4.685
export const BIWEIGHT_ITERATIONS = 6
export { MAD_TO_SD } from '../math'
/** The scale never falls under this share of the centre, so rides that agree to the watt still tolerate a normal day. */
export const MIN_SCALE_SHARE = 0.02

// Heart-rate line.
/** Blocks count when their power is between these shares of the power estimate. */
export const LINE_POWER_BAND = [0.45, 1.05] as const
export const LINE_MIN_BLOCKS = 20
/** A ride with this many blocks, heart rate moving under STUCK_SD_BPM while power moves over STUCK_POWER_CV, is stuck. */
export const STUCK_MIN_BLOCKS = 4
export const STUCK_SD_BPM = 1.5
export const STUCK_POWER_CV = 0.03
/** A ride's offset this far from the pooled one is a strap reading high or low that day. */
export const OFFSET_LIMIT_BPM = 10
/** Heart rate climbs between these many bpm from half to full threshold power in any working strap. */
export const CLIMB_BPM = [20, 70] as const
/**
 * Heart rate's weight in the answer rises from 0 at the flat floor (CLIMB_BPM[0]) to 1 this many bpm above it, on a smoothstep.
 * A shallow line has the most watts per beat, so its slide to threshold heart rate is the least sure, and a hard floor let one
 * ride that tipped the climb past it swing the answer by the most heart rate may lift it.
 */
export const CLIMB_FADE_BPM = 5
/** Theil-Sen thins its points to about this many, so its pairs stay a few tens of thousands. */
export const THEIL_SEN_POINTS = 300
export const THEIL_SEN_MIN_SLOPES = 10

// Heart-rate estimate.
/** Shorter efforts lag in heart rate, longer ones drift up. */
export const HR_EFFORT_S = [480, 1800] as const
/** An effort counts when its heart rate is this share of threshold heart rate (which the caller sets from the reference maximum). */
export const HR_EFFORT_SHARE = [0.85, 1.02] as const
/** An effort this many bpm off its own ride's line counts for nothing; the full width is 4 spreads, at least MIN_SPREAD_BPM. */
export const RESIDUAL_CAP_BPM = 12
export const MIN_SPREAD_BPM = 3
/** The heart-rate estimate's error, in bpm: reading noise, and a share of how far the effort sat from threshold. */
export const READING_SD_BPM = 3
export const GAP_SD_SHARE = 0.1
/** The line's own value at threshold heart rate: its relative error, and the share of an extrapolated gap added to it. */
export const LINE_SD = 0.03
export const LINE_GAP_SD_SHARE = 0.15
/** A wrong reference maximum shifts every heart-rate estimate at once, so this never averages away. */
export const REFERENCE_ERROR = 0.035

// Fusion.
/** The power estimate is a floor: the threshold is power * (1 + g) with g at least 0. */
export const GAP_PRIOR = { smallMean: 0.025, largeShare: 0.3, largeMax: 0.25 } as const
/**
 * Heart rate's estimate is wrong (a reference maximum off, a line that is no line) for this share of riders, and then lands
 * anywhere over this width, as a share of the power estimate. Against it, an estimate far past what the bests allow loses its
 * weight rather than holding the answer at GAP_PRIOR.largeMax.
 */
export const HR_WRONG = { share: 0.05, width: 1 } as const
/** The grid of threshold over power estimate the posterior is read from, and of g under it; both stop just short of their last value. */
export const FUSION_GRID = { from: -0.15, to: 0.45, step: 0.002, gapStep: 0.0025 } as const
