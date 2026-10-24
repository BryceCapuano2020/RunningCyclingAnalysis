import { DURATIONS_S, RUN_RECORD_DISTANCES_M } from '../constants'
import type { RunRecordDistanceM } from '../constants'
import {
  fitBikeModelFor,
  orderedCurrent,
  rideWattsAt,
  runCentralWkg,
  totalCalibration,
} from '../digest/combine'
import type { ActivityDigest, AthleteSettings, Sport } from '../types'

/** A best effort an activity holds across a library: a duration best, or a run distance best. */
export type EarnedRecord =
  { kind: 'duration'; durationS: number } | { kind: 'distance'; distanceM: RunRecordDistanceM }

/**
 * The best efforts each activity holds across a set of digests, for each sport and each duration,
 * and for each run distance. Runs are compared in gross metabolic W/kg, rides in watts priced with
 * the bike model fitted to this set. A tie goes to the earlier activity, since digests are taken in
 * canonical order. Activities that hold nothing are absent from the map.
 */
export function recordHolders(
  digests: ActivityDigest[],
  settings: AthleteSettings,
): Map<string, EarnedRecord[]> {
  const ordered = orderedCurrent(digests)
  const totalMassKg = settings.massKg + settings.bikeMassKg
  const bikeModel = fitBikeModelFor(totalCalibration(ordered), totalMassKg).model
  const held = new Map<string, EarnedRecord[]>()
  const give = (id: string, record: EarnedRecord) => {
    const list = held.get(id)
    if (list) list.push(record)
    else held.set(id, [record])
  }

  for (const sport of ['run', 'ride'] satisfies Sport[]) {
    const own = ordered.filter((digest) => digest.sport === sport)
    for (const durationS of DURATIONS_S) {
      let best: { id: string; value: number } | null = null
      for (const digest of own) {
        const point = digest.curve.find((p) => p.durationS === durationS)
        if (!point) continue
        const value =
          sport === 'run' ? runCentralWkg(point) : rideWattsAt(point, totalMassKg, bikeModel)
        if (Number.isFinite(value) && (best === null || value > best.value)) {
          best = { id: digest.id, value }
        }
      }
      if (best !== null) give(best.id, { kind: 'duration', durationS })
    }
  }

  for (const distanceM of RUN_RECORD_DISTANCES_M) {
    let best: { id: string; seconds: number } | null = null
    for (const digest of ordered) {
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
