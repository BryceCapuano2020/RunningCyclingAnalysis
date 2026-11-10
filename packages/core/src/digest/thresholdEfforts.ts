import { DAY_MS } from '../constants'
import { ALL_OUT_FRACTION } from '../effort'
import {
  DURATION_TABLES,
  estimateOver,
  fitThresholdLine,
  prepareRide,
  thresholdBasis,
} from '../threshold'
import type {
  PreparedRide,
  RideEffort,
  ThresholdBlock,
  ThresholdEstimate,
  ThresholdLine,
} from '../threshold'
import type { ActivityDigest, BikeModel } from '../types'
import { isMeasured } from './bestCurve'
import { effortsCount } from './effortTrust'
import { estimatedStanding } from './estimatedRide'
import type { EstimatedRideGate, EstimatedStanding } from './estimatedRide'
import type { Masses } from './masses'
import { ofSport } from './ordered'
import { powerCheckOf } from './powerCheck'
import { centralWkgFromWatts, pointWkg } from './rideCurves'

const RIDE_TABLE = DURATION_TABLES.ride

/** The longest best the estimate reads: an hour, where the duration ratio reaches 1. */
export const LONGEST_EFFORT_S = 3600

/**
 * What one activity gives its sport's threshold (`rideThreshold`, `runThreshold`), in gross metabolic W/kg, the unit of the
 * sport's best curve (a ride at its own body mass). Its age is not known until the set it is read with is, so it is not part
 * of this.
 */
export interface ActivityEfforts {
  startMs: number
  efforts: RideEffort[]
  blocks: ThresholdBlock[]
  /** The same, worked out once for the estimate to read (`prepareRide`). */
  prepared: PreparedRide
}

/**
 * One ride's bests from 3 to 60 min and its 5 min heart-rate blocks, each as the ride's best curve would admit it: a ride whose
 * power is set aside gives nothing, an estimated point the athlete's heart rate does not back is dropped (`standing`), and a
 * point priced past what a body can do is dropped with it. The heart rate of a ride set aside (`heartAside`) is none.
 * Blocks come from power-meter rides alone: the heart-rate line is fitted on measured watts.
 */
export function rideEffortsOf(
  digest: ActivityDigest,
  masses: Masses,
  bikeModel: BikeModel,
  standing: EstimatedStanding,
  heartAside: boolean,
): ActivityEfforts {
  const efforts: RideEffort[] = []
  const blocks: ThresholdBlock[] = []
  const estimated = !isMeasured(digest)
  for (const point of digest.curve) {
    if (point.durationS < RIDE_TABLE.shortestS || point.durationS > LONGEST_EFFORT_S) continue
    const { wkg } = pointWkg(point, digest, masses, bikeModel, standing)
    if (!(wkg > 0) || !Number.isFinite(wkg)) continue
    efforts.push({
      activityId: digest.id,
      durationS: point.durationS,
      value: wkg,
      heartRate: heartAside ? null : point.heartRate,
      estimated,
    })
  }
  if (!estimated && !heartAside && powerCheckOf(digest, masses) !== 'set-aside') {
    const bodyKg = masses.bodyKg(digest)
    for (const block of digest.hrBlocks) {
      const value = block.terms === null ? centralWkgFromWatts(block.value, bodyKg) : Number.NaN
      if (value > 0 && Number.isFinite(value)) {
        blocks.push({ activityId: digest.id, heartRate: block.heartRate, value })
      }
    }
  }
  return {
    startMs: digest.startMs,
    efforts,
    blocks,
    prepared: prepareRide(digest.id, efforts, blocks, RIDE_TABLE),
  }
}

/** Every counted ride of the digests, read once: what each gives the estimate, in the order given. */
export function ridesOf(
  ordered: ActivityDigest[],
  masses: Masses,
  bikeModel: BikeModel,
  gate: EstimatedRideGate | null,
  heartSetAside: ReadonlySet<string>,
): ActivityEfforts[] {
  const standing = estimatedStanding(gate)
  return ofSport(ordered, 'ride')
    .filter(effortsCount)
    .map((digest) =>
      rideEffortsOf(digest, masses, bikeModel, standing, heartSetAside.has(digest.id)),
    )
}

/**
 * Days back from `newestMs` of each ride, never under 0: the age a window gives its rides. `into` is reused where given, so a
 * library's windows allocate nothing.
 */
export function agesOf(
  rides: readonly { startMs: number }[],
  newestMs: number,
  into: Float64Array = new Float64Array(rides.length),
  lo = 0,
  hi = rides.length,
): Float64Array {
  for (let i = lo; i < hi; i++) into[i] = Math.max(0, (newestMs - rides[i]!.startMs) / DAY_MS)
  return into
}

/** Threshold heart rate: the share of the reference maximum at which an effort is close to all-out. */
export function thresholdHeartRate(referenceMax: number | null): number | null {
  return referenceMax !== null && referenceMax > 0 ? ALL_OUT_FRACTION * referenceMax : null
}

/** The newest start among the digests, ms: the activity the rides of a set are aged from. */
function newestStart(ordered: readonly ActivityDigest[]): number {
  return ordered.reduce((newest, digest) => Math.max(newest, digest.startMs), -Infinity)
}

/**
 * The heart-rate line of a library's activities, fitted once over all their blocks and aged from the newest activity of the
 * digests. A period and every zone window read this line, so the headline and the zones agree.
 */
function thresholdLineOf(activities: readonly ActivityEfforts[], newestMs: number): ThresholdLine {
  return fitThresholdLine(
    activities.map((each) => each.prepared),
    agesOf(activities, newestMs),
  )
}

/**
 * The line a set of activities is read against: fitted over their blocks, or none where there is no threshold heart rate to read
 * it against (`referenceMax` null: a sport whose threshold reads no heart rate), which fits nothing.
 */
function lineFor(
  activities: readonly ActivityEfforts[],
  newestMs: number,
  referenceMax: number | null,
): ThresholdLine {
  return thresholdHeartRate(referenceMax) === null
    ? { refused: 'no-heart-rate' }
    : thresholdLineOf(activities, newestMs)
}

/** A library's activities of one sport, read once, and the line fitted over them: what its periods and its zone windows all read. */
export interface ThresholdLibrary {
  activities: ActivityEfforts[]
  line: ThresholdLine
}

/**
 * A library's activities of a sport read once and the line fitted over them. With no reference maximum (`referenceMax` null) there
 * is no threshold heart rate to read the line against, so none is fitted.
 */
export function libraryOf(
  activities: ActivityEfforts[],
  ordered: ActivityDigest[],
  referenceMax: number | null,
): ThresholdLibrary {
  return { activities, line: lineFor(activities, newestStart(ordered), referenceMax) }
}

/**
 * The threshold of a set of digests of one sport: every activity's bests, read with the sport's best curve's rules, aged from the
 * newest activity of the set (of any sport), with the heart rate of those not set aside, read against `line` (the library's;
 * absent, one is fitted over this set's, or none where `referenceMax` is null). Null where the set has no effort of its sport's
 * shortest length or more.
 */
export function thresholdOf(
  activities: readonly ActivityEfforts[],
  ordered: ActivityDigest[],
  referenceMax: number | null,
  line?: ThresholdLine,
): ThresholdEstimate | null {
  const newestMs = newestStart(ordered)
  const basis = thresholdBasis(
    activities.map((each) => each.prepared),
    line ?? lineFor(activities, newestMs, referenceMax),
    thresholdHeartRate(referenceMax),
  )
  return estimateOver(basis, agesOf(activities, newestMs))
}
