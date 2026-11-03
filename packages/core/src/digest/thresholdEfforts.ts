import { CP_FIT_MIN_S, DAY_MS } from '../constants'
import { ALL_OUT_FRACTION } from '../effort'
import { estimateOver, fitRideLine, prepareRide, thresholdBasis } from '../threshold'
import type {
  PreparedRide,
  RideEffort,
  RideLine,
  ThresholdBlock,
  ThresholdEstimate,
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

/** The longest best the estimate reads: an hour, where the duration ratio reaches 1. */
const LONGEST_EFFORT_S = 3600

/**
 * What one ride gives the ride threshold (`rideThreshold`), in gross metabolic W/kg at the ride's own body mass, the unit
 * of the ride's best curve. Its age is not known until the set it is read with is, so it is not part of this.
 */
export interface RideEfforts {
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
): RideEfforts {
  const efforts: RideEffort[] = []
  const blocks: ThresholdBlock[] = []
  const estimated = !isMeasured(digest)
  for (const point of digest.curve) {
    if (point.durationS < CP_FIT_MIN_S || point.durationS > LONGEST_EFFORT_S) continue
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
    prepared: prepareRide(digest.id, efforts, blocks),
  }
}

/** Every counted ride of the digests, read once: what each gives the estimate, in the order given. */
export function ridesOf(
  ordered: ActivityDigest[],
  masses: Masses,
  bikeModel: BikeModel,
  gate: EstimatedRideGate | null,
  heartSetAside: ReadonlySet<string>,
): RideEfforts[] {
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
export function newestStart(ordered: readonly ActivityDigest[]): number {
  return ordered.reduce((newest, digest) => Math.max(newest, digest.startMs), -Infinity)
}

/**
 * The heart-rate line of a library's rides, fitted once over all their power-meter blocks and aged from the newest activity
 * of the digests. A period and every zone window read this line, so the headline and the zones agree.
 */
export function rideLineOf(rides: readonly RideEfforts[], newestMs: number): RideLine {
  return fitRideLine(
    rides.map((ride) => ride.prepared),
    agesOf(rides, newestMs),
  )
}

/** A library's rides, read once, and the line fitted over them: what its periods and its zone windows all read. */
export interface RideLibrary {
  rides: RideEfforts[]
  line: RideLine
}

/**
 * A library's rides read once and the line fitted over them. With no ride reference (`referenceMax` null) there is no
 * threshold heart rate to read the line against, so none is fitted.
 */
export function rideLibraryOf(
  ordered: ActivityDigest[],
  masses: Masses,
  bikeModel: BikeModel,
  gate: EstimatedRideGate | null,
  heartSetAside: ReadonlySet<string>,
  referenceMax: number | null,
): RideLibrary {
  const rides = ridesOf(ordered, masses, bikeModel, gate, heartSetAside)
  const line: RideLine =
    thresholdHeartRate(referenceMax) === null
      ? { refused: 'no-heart-rate' }
      : rideLineOf(rides, newestStart(ordered))
  return { rides, line }
}

/**
 * The ride threshold of a set of digests: every ride's bests, read with the ride best curve's rules, aged from the newest
 * activity of the set, with the heart rate of the rides not set aside, read against `line` (the library's; absent, one is
 * fitted over this set's rides). Null where the set has no ride effort of 3 min or more.
 */
export function rideThresholdOf(
  ordered: ActivityDigest[],
  masses: Masses,
  bikeModel: BikeModel,
  gate: EstimatedRideGate | null,
  heartSetAside: ReadonlySet<string>,
  referenceMax: number | null,
  line?: RideLine,
): ThresholdEstimate | null {
  const rides = ridesOf(ordered, masses, bikeModel, gate, heartSetAside)
  const newestMs = newestStart(ordered)
  const prepared = rides.map((ride) => ride.prepared)
  const basis = thresholdBasis(
    prepared,
    line ?? rideLineOf(rides, newestMs),
    thresholdHeartRate(referenceMax),
  )
  return estimateOver(basis, agesOf(rides, newestMs))
}
