import { CP_FIT_MIN_S, DAY_MS } from '../constants'
import { ALL_OUT_FRACTION } from '../effort'
import { rideThreshold } from '../threshold'
import type { ThresholdBlock, ThresholdEffort, ThresholdEstimate } from '../threshold'
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
  efforts: Omit<ThresholdEffort, 'ageDays'>[]
  blocks: ThresholdBlock[]
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
  const efforts: RideEfforts['efforts'] = []
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
  return { startMs: digest.startMs, efforts, blocks }
}

/** The efforts and blocks of rides read together, each effort aged from `newestMs`, the newest activity of the set. */
export function thresholdInputs(
  rides: readonly RideEfforts[],
  newestMs: number,
): { efforts: ThresholdEffort[]; blocks: ThresholdBlock[] } {
  const efforts: ThresholdEffort[] = []
  const blocks: ThresholdBlock[] = []
  for (const ride of rides) {
    const ageDays = Math.max(0, (newestMs - ride.startMs) / DAY_MS)
    for (const effort of ride.efforts) efforts.push(Object.assign({ ageDays }, effort))
    for (const block of ride.blocks) blocks.push(block)
  }
  return { efforts, blocks }
}

/** Threshold heart rate: the share of the reference maximum at which an effort is close to all-out. */
export function thresholdHeartRate(referenceMax: number | null): number | null {
  return referenceMax !== null && referenceMax > 0 ? ALL_OUT_FRACTION * referenceMax : null
}

/**
 * The ride threshold of a set of digests: every ride's bests, read with the ride best curve's rules, aged from the newest
 * activity of the set, with the heart rate of the rides not set aside. Null where the set has no ride effort of 3 min or more.
 */
export function rideThresholdOf(
  ordered: ActivityDigest[],
  masses: Masses,
  bikeModel: BikeModel,
  gate: EstimatedRideGate | null,
  heartSetAside: ReadonlySet<string>,
  referenceMax: number | null,
): ThresholdEstimate | null {
  const standing = estimatedStanding(gate)
  const newestMs = ordered.reduce((newest, digest) => Math.max(newest, digest.startMs), -Infinity)
  const rides = ofSport(ordered, 'ride')
    .filter(effortsCount)
    .map((digest) =>
      rideEffortsOf(digest, masses, bikeModel, standing, heartSetAside.has(digest.id)),
    )
  const { efforts, blocks } = thresholdInputs(rides, newestMs)
  return rideThreshold(efforts, blocks, thresholdHeartRate(referenceMax))
}
