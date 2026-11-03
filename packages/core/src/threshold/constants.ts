/*
 * The numbers of the threshold estimate (docs/design/threshold.md), each tuned on the synthetic riders of
 * threshold.sim.test.ts. They live here and not in core's constants.ts, which has no room.
 */

/** The shortest best that says anything about threshold; under this the sprint dominates. */
export const SHORTEST_EFFORT_S = 180

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
export const MAD_TO_SD = 1.4826
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
/** The grid of threshold over power estimate the posterior is read from, and of g under it; both stop just short of their last value. */
export const FUSION_GRID = { from: -0.15, to: 0.45, step: 0.002, gapStep: 0.0025 } as const
