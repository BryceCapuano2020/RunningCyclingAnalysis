import { DURATIONS_S, RUN_RECORD_DISTANCES_M } from '../constants'
import type { RunRecordDistanceM } from '../constants'
import type { Masses } from '../digest/masses'
import { effortsCount } from '../digest/effortTrust'
import { massesOf } from '../digest/masses'
import { orderedFor } from '../digest/consumers'
import { ofSport } from '../digest/ordered'
import { memoByDigests } from '../digestMemo'
import { estimatedStanding, ownRideGate, pointAt } from '../digest/estimatedRide'
import type { EstimatedRideGate, EstimatedStanding } from '../digest/estimatedRide'
import { trustedPower } from '../digest/powerCheck'
import { fitBikeModelOver, pointWkg, runCentralWkg } from '../digest/rideCurves'
import type { ActivityDigest, AthleteSettings, BikeModel, DigestCurvePoint } from '../types'

/** The ride or run holding the best value at a duration. */
interface Best {
  id: string
  value: number
}

/** A best effort an activity holds across a library: a duration best, or a run distance best. */
export type EarnedRecord =
  { kind: 'duration'; durationS: number } | { kind: 'distance'; distanceM: RunRecordDistanceM }

/**
 * A point's value for comparing activities of its sport: gross metabolic W/kg for a run, and for a ride its
 * watts, or with dated body masses its watts per kilogram of the body mass on its day, so the record is held
 * by the same ride the best-effort curve shows. NaN for an estimate the athlete's heart rate does not back (see
 * ESTIMATED_RIDE), which holds no record. `alone` is an estimate with no heart rate that stands at its own
 * duration only.
 */
function valueAt(
  point: DigestCurvePoint,
  digest: ActivityDigest,
  masses: Masses,
  bikeModel: BikeModel,
  standing: EstimatedStanding,
): { value: number; alone: boolean } {
  const { wkg, watts, alone } = pointWkg(point, digest, masses, bikeModel, standing)
  // A run has no watts (NaN), and a dropped ride is NaN in either unit, so NaN watts read as W/kg.
  return { value: masses.dated || Number.isNaN(watts) ? wkg : watts, alone }
}

/** The activity holding the record at a duration. */
interface Holder {
  id: string
  durationS: number
}

/**
 * Who holds each duration's record among one sport's activities: the best value at each duration, a tie to the earlier.
 * The record at the nearest shorter duration that has one caps an estimate that stands alone, as on the curve, so a longer
 * duration never reads higher than a shorter one.
 */
function durationHolders(
  own: ActivityDigest[],
  price: (point: DigestCurvePoint, digest: ActivityDigest) => { value: number; alone: boolean },
): Holder[] {
  const holders: Holder[] = []
  let shorter = Number.POSITIVE_INFINITY
  for (const [index, durationS] of DURATIONS_S.entries()) {
    const bests = { held: null as Best | null, alone: null as Best | null }
    for (const digest of own) {
      const point = pointAt(digest, index)
      if (!point) continue
      const { value, alone } = price(point, digest)
      const kind = alone ? 'alone' : 'held'
      if (alone && value > shorter) continue
      if (Number.isFinite(value) && (bests[kind] === null || value > bests[kind].value)) {
        bests[kind] = { id: digest.id, value }
      }
    }
    const { held, alone } = bests
    const best = alone !== null && (held === null || alone.value > held.value) ? alone : held
    if (best !== null) {
      holders.push({ id: best.id, durationS })
      shorter = best.value
    }
  }
  return holders
}

/**
 * The runs' record holders, kept for the last runs asked for: a run is compared in W/kg at its pace and holds no
 * estimate, so a change of body mass, bike model or ride gate takes the holders already worked out for the same runs.
 */
const runHolders = memoByDigests(
  (runs: ActivityDigest[], _input: null) =>
    durationHolders(runs, (point) => ({ value: runCentralWkg(point), alone: false })),
  () => true,
)

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
  const ordered = orderedFor('records', digests)
  const masses = massesOf(settings)
  const bikeModel = fitBikeModelOver(ordered, masses).model
  // A treadmill run holds no record (see effortsCount), though its own times still show on its page.
  const eligible = ordered.filter(effortsCount)
  const standing = estimatedStanding(
    gate === undefined ? ownRideGate(trustedPower(ordered, masses)) : gate,
  )
  const held = new Map<string, EarnedRecord[]>()
  const give = (id: string, record: EarnedRecord) => {
    const list = held.get(id)
    if (list) list.push(record)
    else held.set(id, [record])
  }

  const holders = [
    ...runHolders(ofSport(eligible, 'run'), null),
    ...durationHolders(ofSport(eligible, 'ride'), (point, digest) =>
      valueAt(point, digest, masses, bikeModel, standing),
    ),
  ]
  for (const { id, durationS } of holders) give(id, { kind: 'duration', durationS })

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
