/**
 * Shared contracts for the analysis core. Every module in src/core depends on
 * these types and on nothing in src/ui, so the core can run in a Web Worker or
 * in Node tests unchanged.
 */

import type {
  DigestDistributions,
  DigestDrift,
  DigestDurabilityPoint,
} from './digest/evidenceTypes'
import type { RouteShape } from './route/routeShape'
import type { DigestSplits } from './splits/types'
import type { ActivityLap, CadenceUnit } from './workbench/types'

export type { DigestSplit, DigestSplits } from './splits/types'
export type {
  DigestDistribution,
  DigestDistributions,
  DigestDrift,
  DigestDurabilityPoint,
} from './digest/evidenceTypes'

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
  /** Optional measured cadence stream. GPX cadence source units may be unspecified. */
  cadence?: Float32Array
  /** Cadence unit provenance; absent for legacy Activities with the sport-standard unit. */
  cadenceUnit?: CadenceUnit
  /** Optional recorded ambient temperature, degrees Celsius. */
  temperature?: Float32Array
  /** Device-recorded lap boundaries, in elapsed seconds on this activity's grid. */
  laps?: ActivityLap[]
  /**
   * 1 where the device was not recording (auto-pause or a stop). Speed and power
   * are 0 there, so duration curves treat a pause as rest in elapsed time.
   */
  paused: Uint8Array
  hasPower: boolean
  hasHeartRate: boolean
  hasAltitude: boolean
  /** False when the source recorded neither speed nor distance, so those streams are placeholders. */
  hasMotion?: boolean
  /** Treadmill, trainer or virtual activity: gradient and GPS speed are not real. */
  indoor: boolean
  /**
   * 1 inside a record gap the device did not time (see resample), where distance and time are not
   * known. Distance bests cannot span these seconds. Absent for an activity built without resampling.
   */
  unrecorded?: Uint8Array
  /**
   * The file an activity came from, when that file holds more than one activity: the legs of a
   * multisport session, or the parts of one unit split by a long gap. Absent for a lone activity.
   */
  sessionKey?: string
  /**
   * The outline of an outdoor GPS track, with its position removed. Kept on the device only, never
   * in a digest or sent to the server. See route/routeShape.ts.
   */
  route?: RouteShape
}

export type { AthleteSettings } from './athlete/settings'

export type QualityKind =
  | 'hr-dropout'
  | 'hr-spike'
  | 'hr-implausible-for-power'
  | 'power-spike'
  | 'power-dropout'
  | 'speed-spike'
  | 'implausible-speed'
  | 'altitude-jump'
  | 'implausible-climb'
  | 'stream-disagreement'
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
  /** 1 where speed is usable by motion and virtual-power models, else 0. Length n. */
  validMotion: Uint8Array
  /** 1 where measured power is usable, independent of GPS and altitude quality, else 0. Length n. */
  validPower: Uint8Array
  /** 1 where grade derived from altitude is usable, else 0. Length n. */
  validGrade: Uint8Array
  /**
   * 1 where the altitude sample is finite and not left out by an altitude-jump or implausible-climb
   * flag, else 0. Unlike validGrade, it does not depend on the grade, so it is the mask for air
   * density. Length n.
   */
  validAltitude: Uint8Array
  /** 1 where the heart-rate sample is usable, else 0. Length n. */
  validHeartRate: Uint8Array
}

/** Where a ride's watts come from: a power meter, the virtual-power model, or none (a run). */
export type PowerSource = 'measured' | 'virtual' | 'none'

export interface CurvePoint {
  durationS: number
  /** Best mean value over any window of durationS. NaN when no valid window exists. */
  value: number
  /** Activity that produced the best window, or null when value is NaN. */
  activityId: string | null
  /** Start sample index of the best window within that activity, or -1. */
  startIndex: number
  /**
   * Length, s, of the window the value came from, which can be longer than durationS once the monotone
   * envelope has copied a longer effort's value. Carried with the value, as startIndex is. Absent on
   * curves made without digests.
   */
  windowS?: number | null
}

export type Curve = CurvePoint[]

/**
 * Why a critical-power fit is refused. 'missing': the efforts are not there, under four in the window
 * or none reaching 20 minutes. 'shape': the efforts are there but show no threshold, being flat, below
 * the least work capacity, or with an intercept above their lowest effort.
 */
export type CriticalPowerRefusal = 'missing' | 'shape'

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

/**
 * How hard the best effort at one duration really was, judged by heart rate.
 * A best effort well below the athlete's highest sustained heart rate was probably not
 * all-out, so that sport is understated at that duration.
 */
export interface EffortCheck {
  durationS: number
  /** Mean heart rate in the best running window divided by runMaxHeartRate; null if unknown. */
  runHrFraction: number | null
  /** Same for the best cycling window, divided by rideMaxHeartRate. */
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
  /** Mean of 0.5 * air density * v^3, W per m^2 of CdA, with density in kg/m^3 per sample. */
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

/** A run's fastest elapsed time over one record distance. Wall clock, so pauses inside it count. */
export interface DigestDistanceBest {
  distanceM: number
  seconds: number
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
  /** Analysis model revision; missing on the wire means legacy revision 1. */
  modelRevision: number
  id: string
  name: string
  sport: Sport
  startMs: number
  durationS: number
  distanceM: number
  elevationGainM: number
  hasHeartRate: boolean
  indoor: boolean
  powerSource: PowerSource
  /** The first 50 quality flags, earliest first. */
  flags: QualityFlag[]
  /** True number of flags of each kind, including those beyond the 50 kept in `flags`. */
  flagCounts: Partial<Record<QualityKind, number>>
  /** Highest sustained (30 s smoothed) valid heart rate in this activity, or null. */
  maxHeartRate: number | null
  /** One point per DURATIONS_S entry, monotone envelope already applied. */
  curve: DigestCurvePoint[]
  hrBlocks: DigestHrBlock[]
  /** Power-meter rides outdoors only. */
  calibration: CalibrationSums | null
  /** Power-meter rides outdoors only: climb sections for scoring the virtual power meter. */
  climbSections: DigestClimbSection[]
  /**
   * Runs only, absent for rides and for digests from before this field. One entry per record
   * distance the run covers and has a valid window for, in ascending distance.
   */
  distanceBests?: DigestDistanceBest[]
  /** Runs only. Absent on rides and on digests made before splits were kept. */
  splits?: DigestSplits
  /**
   * Seconds the device was recording: neither paused nor in a record gap, so at most durationS.
   * Absent on older digests.
   */
  movingS?: number
  /** Mean heart rate over the moving seconds, bpm; null without a heart-rate stream. Absent on older digests. */
  avgHeartRate?: number | null
  /** Mean measured power over the moving seconds, W; null without a power meter. Absent on older digests. */
  avgPowerW?: number | null
  /** The file this activity came from, when that file holds more than one activity. See Activity.sessionKey. */
  sessionKey?: string
  /** Seconds in each bin of heart rate, power and speed, so zones can be applied later. Absent on older digests. */
  distributions?: DigestDistributions
  /** Best output after 1, 1.5 and 2 hours of moving time; only the points the activity supports. Absent on older digests. */
  durability?: DigestDurabilityPoint[]
  /** Output per heart rate, first half against second, of a steady effort; null when it is not one. Absent on older digests. */
  drift?: DigestDrift | null
}

/** The best run and ride curves of one set of digests. See sportCurves. */
export interface SportCurves {
  /** Best gross metabolic power while running, W/kg. */
  runCurve: Curve
  /** Best mechanical power while riding, W. */
  rideCurve: Curve
}
