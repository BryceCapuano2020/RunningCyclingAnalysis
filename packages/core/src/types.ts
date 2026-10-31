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
import type { ReferenceReading, ReferenceSource } from './effort/reference'
import type { RouteShape } from './route/routeShape'
import type {
  DigestClimbSection,
  DigestCurvePoint,
  DigestDistanceBest,
  DigestHrBlock,
} from './digest/partTypes'
import type { DigestSplits } from './splits/types'
import type { ActivityLap, CadenceUnit } from './workbench/types'

export type { DigestSplit, DigestSplits } from './splits/types'
export type {
  DigestClimbSection,
  DigestCurvePoint,
  DigestDistanceBest,
  DigestHrBlock,
} from './digest/partTypes'
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
  /** True when the file's export tags the activity as a race, such as Strava's Competition column. Absent otherwise. */
  race?: true
  /**
   * The local calendar date at the start minus the UTC date, from the zone the file records. Absent when the
   * file gives none (a UTC time, no activity message). No offset is kept, only this.
   */
  localDayShift?: LocalDayShift
  /**
   * The outline of an outdoor GPS track, with its position removed. Kept on the device only, never
   * in a digest or sent to the server. See route/routeShape.ts.
   */
  route?: RouteShape
}

export type { AthleteSettings } from './athlete/settings'

import type { QualityFlag, QualityKind } from './quality/types'

export type { QualityFlag, QualityKind, QualityReport } from './quality/types'

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
  /**
   * What each sport's reference can certify (see ReferenceReading): a share of a reference that is `low` or
   * `habitual` does not show an effort was hard. Null without a reference. The analysis always sets them; absent reads
   * as `trusted`, for a check made without one.
   */
  runReference?: ReferenceReading | null
  rideReference?: ReferenceReading | null
  /** Where each reference came from (the activities, a maximum entered, or the age). Absent reads as the activities. */
  runReferenceSource?: ReferenceSource | null
  rideReferenceSource?: ReferenceSource | null
  /**
   * The other sport whose days set a reference the activities gave, when it is not the sport's own (cycling's is running's less 6
   * bpm; running's is cycling's when that is higher). Present only then; absent reads as the sport's own.
   */
  runReferenceFrom?: Sport
  rideReferenceFrom?: Sport
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
  /** True when the export the activity came from tags it as a race (Strava's Competition column). Absent otherwise and on older digests. */
  race?: true
  /**
   * Runs only: true for a run at walking pace, a hike recorded as a run (see WALKING_PACE). It is kept in the
   * library and left out of the analysis. Absent otherwise and on older digests.
   */
  walkingPace?: true
  /** Seconds in each bin of heart rate, power and speed, so zones can be applied later. Absent on older digests. */
  distributions?: DigestDistributions
  /** Best output after 1, 1.5 and 2 hours of moving time; only the points the activity supports. Absent on older digests. */
  durability?: DigestDurabilityPoint[]
  /** Output per heart rate, first half against second, of a steady effort; null when it is not one. Absent on older digests. */
  drift?: DigestDrift | null
  /** Revision 7: the day's warmth as the sensor read it. Absent before revision 7 and when the file has no usable reading. */
  temperature?: DigestTemperature
  /** Revision 7: the athlete's own label when it says the activity is not what the file's sport says. Absent otherwise and before revision 7. */
  athleteType?: AthleteType
  /** Revision 7: the local calendar date minus the UTC date at the start. Absent before revision 7 and for files with no local time. */
  localDayShift?: LocalDayShift
}

/** The classes the athlete's own activity type maps to, when it is not a run or a ride. */
export type AthleteType = 'walk' | 'hike' | 'ski' | 'other'

/** The local calendar date minus the UTC date: any UTC offset from -12:00 to +14:00 gives one of these. */
export type LocalDayShift = -1 | 0 | 1

/** A temperature summary: the median of one-minute means, degrees Celsius, and how much of the activity had a reading. */
export interface DigestTemperature {
  c: number
  /** Share of eligible seconds with a valid reading, 0.5 to 1. */
  coverage: number
}

/** The best run and ride curves of one set of digests. See sportCurves. */
export interface SportCurves {
  /** Best gross metabolic power while running, W/kg. */
  runCurve: Curve
  /** Best mechanical power while riding, W. */
  rideCurve: Curve
  /**
   * How hard the best efforts at the headline duration were, by heart rate, judged against the library's reference
   * heart rates as a period's own `effort` is. Present only when the caller passed the references; absent otherwise.
   */
  headlineEffort?: EffortCheck
}
