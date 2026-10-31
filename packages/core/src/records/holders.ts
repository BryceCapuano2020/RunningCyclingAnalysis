import { DURATIONS_S, RUN_RECORD_DISTANCES_M } from '../constants'
import type { RunRecordDistanceM } from '../constants'
import { massesOf } from '../digest/masses'
import { orderedFor } from '../digest/consumers'
import { ofSport } from '../digest/ordered'
import { memoByDigests } from '../digestMemo'
import { estimatedStanding, ownRideGate } from '../digest/estimatedRide'
import type { EstimatedRideGate } from '../digest/estimatedRide'
import { fitBikeModelOver } from '../digest/rideCurves'
import type { ActivityDigest, AthleteSettings } from '../types'
import { eligibleDigests, readingsByDuration, recordAt, ridePricer, runPricer } from './progression'
import type { Reading } from './progression'

/** A best effort an activity holds across a library: a duration best, or a run distance best. */
export type EarnedRecord =
  { kind: 'duration'; durationS: number } | { kind: 'distance'; distanceM: RunRecordDistanceM }

/** The activity holding the record at a duration. */
interface Holder {
  id: string
  durationS: number
}

/**
 * Who holds each duration's record among one sport's priced points: the best value at each duration, a tie to the earlier.
 * The record at the nearest shorter duration that has one caps an estimate that stands alone, as on the curve, so a longer
 * duration never reads higher than a shorter one.
 */
function durationHolders(readings: Reading[][]): Holder[] {
  const holders: Holder[] = []
  let shorter = Number.POSITIVE_INFINITY
  for (const [index, durationS] of DURATIONS_S.entries()) {
    const best = recordAt(readings[index]!, shorter)
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
  (runs: ActivityDigest[], _input: null) => durationHolders(readingsByDuration(runs, runPricer)),
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
  const eligible = eligibleDigests(digests)
  const standing = estimatedStanding(gate === undefined ? ownRideGate(ordered) : gate)
  const held = new Map<string, EarnedRecord[]>()
  const give = (id: string, record: EarnedRecord) => {
    const list = held.get(id)
    if (list) list.push(record)
    else held.set(id, [record])
  }

  const holders = [
    ...runHolders(ofSport(eligible, 'run'), null),
    ...durationHolders(
      readingsByDuration(ofSport(eligible, 'ride'), ridePricer(masses, bikeModel, standing)),
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
