import { DURATIONS_S } from '../constants'
import { effortsCount } from '../digest/effortTrust'
import { estimatedStanding } from '../digest/estimatedRide'
import type { EstimatedRideGate } from '../digest/estimatedRide'
import { massesOf } from '../digest/masses'
import { orderedCurrent } from '../digest/ordered'
import { pointWkg } from '../digest/rideCurves'
import { metabolicToFlatSpeed } from '../metabolic'
import type { ActivityDigest, AthleteSettings, BikeModel, Sport } from '../types'

const INDEX_OF = new Map<number, number>(DURATIONS_S.map((durationS, i) => [durationS, i]))

/**
 * What an effort is compared in, by sport: a run in flat speed (m/s, which the page writes as a pace), a ride in
 * W/kg (watts at one mass; with dated body masses it is the rule the ride curve picks its best by). A best
 * is the highest of these, so the periods' bests are the maxima of the readings below.
 */
const COMPARED: Record<Sport, (wkg: number) => number> = {
  run: metabolicToFlatSpeed,
  ride: (wkg) => wkg,
}

/** Every activity's reading at each curve duration, by sport: `byDuration[i]` is for DURATIONS_S[i]. */
export type Readings = Record<Sport, number[][]>

/**
 * Each activity's best effort at or above each curve duration, priced as the curves are: the activity's own curve
 * is already a monotone envelope, so the best of a period at a length is the highest reading of its activities
 * there. An estimated ride point that stands at its own length only counts at that length (see ESTIMATED_RIDE),
 * and one the gate drops does not count. A treadmill run holds no best.
 */
export function readingsOf(
  digests: ActivityDigest[],
  settings: AthleteSettings,
  bikeModel: BikeModel,
  gate: EstimatedRideGate | null | undefined,
): Readings {
  const masses = massesOf(settings)
  const standing = estimatedStanding(gate ?? null)
  const out: Readings = {
    run: DURATIONS_S.map(() => []),
    ride: DURATIONS_S.map(() => []),
  }
  for (const digest of orderedCurrent(digests)) {
    if (!effortsCount(digest)) continue
    const points = digest.curve.map((point) => pointWkg(point, digest, masses, bikeModel, standing))
    // From the longest length down: `held` is the best of the points that count at every shorter length too.
    let held = Number.NEGATIVE_INFINITY
    for (let i = points.length - 1; i >= 0; i--) {
      const { wkg, alone } = points[i]!
      const finite = Number.isFinite(wkg)
      if (finite && !alone && wkg > held) held = wkg
      const here = finite && alone ? Math.max(held, wkg) : held
      const index = INDEX_OF.get(digest.curve[i]!.durationS)
      if (index === undefined || !Number.isFinite(here)) continue
      const value = COMPARED[digest.sport](here)
      if (value > 0) out[digest.sport][index]!.push(value)
    }
  }
  return out
}
