import { DURATIONS_S, RUN_RECORD_DISTANCES_M } from '../constants'
import type { RunRecordDistanceM } from '../constants'
import type { Masses } from '../digest/masses'
import { effortsCount } from '../digest/effortTrust'
import { massesOf } from '../digest/masses'
import { orderedCurrent } from '../digest/ordered'
import { estimatedStanding, ownRideGate, pointAt } from '../digest/estimatedRide'
import type { EstimatedRideGate, EstimatedStanding } from '../digest/estimatedRide'
import {
  centralWkgFromWatts,
  fitBikeModelOver,
  ridePriced,
  runCentralWkg,
} from '../digest/rideCurves'
import type { ActivityDigest, AthleteSettings, BikeModel, DigestCurvePoint, Sport } from '../types'

/** The ride or run holding the best value at a duration. */
interface Best {
  id: string
  value: number
}

/** A best effort an activity holds across a library: a duration best, or a run distance best. */
export type EarnedRecord =
  { kind: 'duration'; durationS: number } | { kind: 'distance'; distanceM: RunRecordDistanceM }

/**
 * A ride point's value for comparing rides: its watts, or with dated body masses its watts per kilogram of
 * the body mass on its day, so the record is held by the same ride the best-effort curve shows. NaN for an
 * estimate the athlete's heart rate does not back (see ESTIMATED_RIDE), which holds no record. `alone` is an
 * estimate with no heart rate that stands at its own duration only.
 */
function rideValueAt(
  point: DigestCurvePoint,
  digest: ActivityDigest,
  masses: Masses,
  bikeModel: BikeModel,
  standing: EstimatedStanding,
): { value: number; alone: boolean } {
  const { watts, alone } = ridePriced(point, digest, masses, bikeModel, standing)
  return { value: masses.dated ? centralWkgFromWatts(watts, masses.bodyKg(digest)) : watts, alone }
}

/**
 * The best efforts each activity holds across a set of digests, for each sport and each duration,
 * and for each run distance. Runs are compared in gross metabolic W/kg, rides in watts priced with
 * the bike model fitted to this set. A tie goes to the earlier activity, since digests are taken in
 * canonical order. Activities that hold nothing are absent from the map. `gate` is the library's estimated-ride
 * gate (`HeartRateJudgement.rideGate`), so a record is held by the ride the curve shows; absent, it is built
 * from these digests, and null counts every estimated point.
 */
export function recordHolders(
  digests: ActivityDigest[],
  settings: AthleteSettings,
  gate?: EstimatedRideGate | null,
): Map<string, EarnedRecord[]> {
  const ordered = orderedCurrent(digests)
  const masses = massesOf(settings)
  const bikeModel = fitBikeModelOver(ordered, masses).model
  // A treadmill run holds no record (see effortsCount), though its own times still show on its page.
  const eligible = ordered.filter(effortsCount)
  const standing = estimatedStanding(gate === undefined ? ownRideGate(ordered) : gate)
  const held = new Map<string, EarnedRecord[]>()
  const give = (id: string, record: EarnedRecord) => {
    const list = held.get(id)
    if (list) list.push(record)
    else held.set(id, [record])
  }

  for (const sport of ['run', 'ride'] satisfies Sport[]) {
    const own = eligible.filter((digest) => digest.sport === sport)
    // The record at the nearest shorter duration that has one: an estimate that stands alone is kept only under it,
    // as on the curve, so a longer duration never reads higher than a shorter one.
    let shorter = Number.POSITIVE_INFINITY
    for (const [index, durationS] of DURATIONS_S.entries()) {
      const bests = { held: null as Best | null, alone: null as Best | null }
      for (const digest of own) {
        const point = pointAt(digest, index)
        if (!point) continue
        const { value, alone } =
          sport === 'run'
            ? { value: runCentralWkg(point), alone: false }
            : rideValueAt(point, digest, masses, bikeModel, standing)
        const kind = alone ? 'alone' : 'held'
        if (alone && value > shorter) continue
        if (Number.isFinite(value) && (bests[kind] === null || value > bests[kind].value)) {
          bests[kind] = { id: digest.id, value }
        }
      }
      const { held: heldBest, alone: aloneBest } = bests
      const best =
        aloneBest !== null && (heldBest === null || aloneBest.value > heldBest.value)
          ? aloneBest
          : heldBest
      if (best !== null) {
        give(best.id, { kind: 'duration', durationS })
        shorter = best.value
      }
    }
  }

  for (const distanceM of RUN_RECORD_DISTANCES_M) {
    let best: { id: string; seconds: number } | null = null
    for (const digest of eligible) {
      if (digest.sport !== 'run') continue
      const seconds = digest.distanceBests?.find((b) => b.distanceM === distanceM)?.seconds
      if (seconds !== undefined && (best === null || seconds < best.seconds)) {
        best = { id: digest.id, seconds }
      }
    }
    if (best !== null) give(best.id, { kind: 'distance', distanceM })
  }
  return held
}
