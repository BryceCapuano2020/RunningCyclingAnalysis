/**
 * Types of the fitted models (critical power, bike, linear fits) and of the run-versus-ride comparison built
 * on them. types.ts re-exports them, so importers keep one path.
 */

/**
 * Why a critical-power fit is refused. 'missing': the efforts are not there, under four in the window
 * or none reaching 20 minutes. 'shape': the efforts are there but show no threshold, being flat, below
 * the least work capacity, or with an intercept above their lowest effort. 'effort': a fit that passed
 * both, withheld because the best 20 minutes was not a hard effort (the effort gate, set by the analysis).
 */
export type CriticalPowerRefusal = 'missing' | 'shape' | 'effort'

export interface CriticalPowerFit {
  /** Asymptote, in the unit of the fitted curve. */
  cp: number
  /** Finite work capacity above cp, in (curve unit) x seconds. */
  wPrime: number
  /** Standard error of cp. */
  cpSe: number
  r2: number
  nPoints: number
}

export interface BikeModel {
  /** Drag area, m^2. */
  cda: number
  /** Rolling resistance coefficient. */
  crr: number
}

export interface VirtualPowerAccuracy {
  /** Number of climb segments scored. */
  nSegments: number
  /** Mean of |estimated - measured| / measured over segments. */
  mape: number
  /** Mean of (estimated - measured) / measured over segments. */
  bias: number
  segments: {
    activityId: string
    start: number
    end: number
    measuredW: number
    estimatedW: number
  }[]
}

export interface LinearFit {
  slope: number
  intercept: number
  slopeSe: number
  r2: number
  n: number
}

export interface HrPoint {
  /** Block-mean gross metabolic power, W/kg. */
  metabolicPower: number
  /** Block-mean heart rate, bpm. */
  heartRate: number
  activityId: string
}

export interface HrCrossCheck {
  run: { points: HrPoint[]; fit: LinearFit } | null
  ride: { points: HrPoint[]; fit: LinearFit } | null
  /**
   * Ride slope divided by run slope. 1 means the prior efficiency assumptions
   * agree with heart rate; above 1 means riding costs this athlete more
   * metabolic power than assumed, relative to running. Null when either sport
   * lacks enough data.
   */
  kappa: number | null
  /** Standard error of ln(kappa), including model discrepancy. */
  lnKappaSe: number | null
}

/**
 * What the run-versus-ride sampling reads of a heart-rate check: the ratio of the two slopes and its error.
 * An `HrCrossCheck` is one; the library's judgement keeps only these two numbers.
 */
export type HrCalibration = Pick<HrCrossCheck, 'kappa' | 'lnKappaSe'>

export interface Interval {
  p05: number
  p50: number
  p95: number
}

export interface ComparisonPoint {
  durationS: number
  /** Run gross metabolic W/kg divided by ride gross metabolic W/kg. */
  ratio: Interval
  runMetabolic: Interval
  rideMetabolic: Interval
}

export interface Comparison {
  /** Using population priors only. */
  prior: ComparisonPoint[]
  /** After the heart-rate cross-check, or null when unavailable or unsupported by the draws. */
  calibrated: ComparisonPoint[] | null
  /** Sampling diagnostic, present when a heart-rate adjustment was attempted. */
  calibration?: { effectiveSamples: number; draws: number; accepted: boolean }
}
