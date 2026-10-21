/**
 * Shared contracts for the analysis core. Every module in src/core depends on
 * these types and on nothing in src/ui, so the core can run in a Web Worker or
 * in Node tests unchanged.
 */

export type Sport = 'run' | 'ride'

/**
 * One activity on a 1 Hz elapsed-time grid. Every stream has length `n`.
 * A missing sample is NaN. Index i is i seconds after `startMs`.
 */
export interface Activity {
  id: string
  name: string
  sport: Sport
  /** Epoch milliseconds of the first sample. */
  startMs: number
  n: number
  /** Ground speed, m/s. */
  speed: Float64Array
  /** Cumulative distance, m. Non-decreasing. */
  distance: Float64Array
  /** Altitude, m. */
  altitude: Float64Array
  /** Heart rate, bpm. */
  heartRate: Float64Array
  /** Measured mechanical power, W. All NaN when the device had no power meter. */
  power: Float64Array
  /**
   * 1 where the device was not recording (auto-pause or a stop). Speed and power
   * are 0 there, so duration curves treat a pause as rest in elapsed time.
   */
  paused: Uint8Array
  hasPower: boolean
  hasHeartRate: boolean
  hasAltitude: boolean
  /** Treadmill, trainer or virtual activity: gradient and GPS speed are not real. */
  indoor: boolean
}

export interface AthleteSettings {
  /** Body mass, kg. */
  massKg: number
  /** Bike plus kit mass, kg. */
  bikeMassKg: number
}

export type QualityKind =
  | 'hr-dropout'
  | 'hr-spike'
  | 'hr-implausible-for-power'
  | 'power-spike'
  | 'power-dropout'
  | 'speed-spike'
  | 'altitude-jump'
  | 'missing-altitude'

export interface QualityFlag {
  kind: QualityKind
  /** First affected sample index, inclusive. */
  start: number
  /** Last affected sample index, exclusive. */
  end: number
  /** Human-readable, one sentence, no trailing period. */
  message: string
}

export interface QualityReport {
  flags: QualityFlag[]
  /** 1 where the speed/altitude/power sample is usable for curves, else 0. Length n. */
  validMotion: Uint8Array
  /** 1 where the heart-rate sample is usable, else 0. Length n. */
  validHeartRate: Uint8Array
}

/** Per-sample quantities derived from an Activity. Every stream has length n. */
export interface DerivedStreams {
  /** Smoothed gradient as rise/run (0.05 = 5%). */
  grade: Float64Array
  /** Mechanical power used for the model, W. Rides only; NaN for runs. */
  mechanicalPower: Float64Array
  /** Where mechanicalPower came from. */
  powerSource: 'measured' | 'virtual' | 'none'
  /** Gross metabolic power, W per kg body mass. NaN where it cannot be computed. */
  metabolicPower: Float64Array
  /** 1 where metabolicPower may be used in duration curves. Length n. */
  valid: Uint8Array
}

export interface CurvePoint {
  durationS: number
  /** Best mean value over any window of durationS. NaN when no valid window exists. */
  value: number
  /** Activity that produced the best window, or null when value is NaN. */
  activityId: string | null
  /** Start sample index of the best window within that activity, or -1. */
  startIndex: number
}

export type Curve = CurvePoint[]

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
  /** After the heart-rate cross-check, or null when it was unavailable. */
  calibrated: ComparisonPoint[] | null
}

/**
 * How hard the best effort at one duration really was, judged by heart rate.
 * A best effort well below the athlete's highest heart rate was probably not
 * all-out, so that sport is understated at that duration.
 */
export interface EffortCheck {
  durationS: number
  /** Mean heart rate in the best running window divided by maxHeartRate; null if unknown. */
  runHrFraction: number | null
  /** Same for the best cycling window. */
  rideHrFraction: number | null
}

/**
 * Power-model terms for a stretch of riding, normalised so they do not depend on
 * mass or the bike model. Mean mechanical power for that stretch under total mass
 * m (kg) and a BikeModel is (m * (gravityAccel + crr * rolling) + cda * aero) / DRIVETRAIN_EFFICIENCY.
 */
export interface PowerTerms {
  /** Mean of (G sin(theta) + accel) * v, W per kg. */
  gravityAccel: number
  /** Mean of G cos(theta) * v, W per kg per unit crr. */
  rolling: number
  /** Mean of 0.5 * RHO_AIR * v^3, W per m^2 of CdA. */
  aero: number
}

/** Mass-independent sufficient statistics for calibrating the bike model on one ride. */
export interface CalibrationSums {
  blocks: number
  /** Sums over qualifying 30 s blocks of products of block means; P is measured power x efficiency. */
  rr: number
  ra: number
  aa: number
  rP: number
  rG: number
  aP: number
  aG: number
}

export interface DigestCurvePoint {
  durationS: number
  /**
   * Runs: best gross metabolic W/kg at the prior-mean economy. Rides with a power
   * meter: best measured mechanical W. Rides without: NaN here, see `terms`.
   */
  value: number
  startIndex: number
  /** Length of the window this value really came from (>= durationS after the monotone envelope). */
  windowS: number
  /** Mean valid heart rate over that window, or null. */
  heartRate: number | null
  /** Virtual-power rides only: power terms of the chosen climb window. */
  terms: PowerTerms | null
}

export interface DigestHrBlock {
  heartRate: number
  /** Runs: mean gross metabolic W/kg. Rides with power: mean measured W. Otherwise NaN. */
  value: number
  /** Virtual-power rides only. */
  terms: PowerTerms | null
}

export interface DigestClimbSection {
  start: number
  end: number
  measuredW: number
  terms: PowerTerms
}

/**
 * Everything the cross-activity analysis needs from one activity, independent of
 * the athlete's settings, so it can be computed once at import, stored on the
 * server as JSON, and combined later in the browser. Non-finite numbers are
 * serialised as null by the transport layer and restored to NaN.
 */
export interface ActivityDigest {
  version: 1
  id: string
  name: string
  sport: Sport
  startMs: number
  durationS: number
  distanceM: number
  elevationGainM: number
  hasHeartRate: boolean
  indoor: boolean
  powerSource: DerivedStreams['powerSource']
  flags: QualityFlag[]
  /** Highest sustained (30 s smoothed) valid heart rate in this activity, or null. */
  maxHeartRate: number | null
  /** One point per DURATIONS_S entry, monotone envelope already applied. */
  curve: DigestCurvePoint[]
  hrBlocks: DigestHrBlock[]
  /** Power-meter rides outdoors only. */
  calibration: CalibrationSums | null
  /** Power-meter rides outdoors only: climb sections for scoring the virtual power meter. */
  climbSections: DigestClimbSection[]
}
