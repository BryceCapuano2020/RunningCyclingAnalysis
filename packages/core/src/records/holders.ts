import { DURATIONS_S, RUN_RECORD_DISTANCES_M } from '../constants'
import type { RunRecordDistanceM } from '../constants'
import type { Masses } from '../digest/masses'
import { effortsCount } from '../digest/effortTrust'
import { massesOf } from '../digest/masses'
import { orderedCurrent } from '../digest/ordered'
import { estimatedHolds, ownRideGate, pointAt } from '../digest/estimatedRide'
import type { EstimatedHolds, EstimatedRideGate } from '../digest/estimatedRide'
import {
  centralWkgFromWatts,
  fitBikeModelOver,
  heldRideWatts,
  runCentralWkg,
} from '../digest/rideCurves'
import type { ActivityDigest, AthleteSettings, BikeModel, DigestCurvePoint, Sport } from '../types'

/** A best effort an activity holds across a library: a duration best, or a run distance best. */
export type EarnedRecord =
  { kind: 'duration'; durationS: number } | { kind: 'distance'; distanceM: RunRecordDistanceM }

/**
 * A ride point's value for comparing rides: its watts, or with dated body masses its watts per kilogram of
 * the body mass on its day, so the record is held by the same ride the best-effort curve shows. NaN for an
 * estimate the athlete's heart rate does not back (see ESTIMATED_RIDE), which holds no record.
 */
function rideValueAt(
  point: DigestCurvePoint,
  digest: ActivityDigest,
  masses: Masses,
  bikeModel: BikeModel,
  holds: EstimatedHolds,
): number {
  const watts = heldRideWatts(point, digest, masses, bikeModel, holds)
  return masses.dated ? centralWkgFromWatts(watts, masses.bodyKg(digest)) : watts
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
  const holds = estimatedHolds(gate === undefined ? ownRideGate(ordered) : gate, eligible)
  const held = new Map<string, EarnedRecord[]>()
  const give = (id: string, record: EarnedRecord) => {
    const list = held.get(id)
    if (list) list.push(record)
    else held.set(id, [record])
  }

  for (const sport of ['run', 'ride'] satisfies Sport[]) {
    const own = eligible.filter((digest) => digest.sport === sport)
    for (const [index, durationS] of DURATIONS_S.entries()) {
      let best: { id: string; value: number } | null = null
      for (const digest of own) {
        const point = pointAt(digest, index)
        if (!point) continue
        const value =
          sport === 'run'
            ? runCentralWkg(point)
            : rideValueAt(point, digest, masses, bikeModel, holds)
        if (Number.isFinite(value) && (best === null || value > best.value)) {
          best = { id: digest.id, value }
        }
      }
      if (best !== null) give(best.id, { kind: 'duration', durationS })
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
