import { DURATIONS_S } from '../constants'
import { estimatedStanding } from '../digest/estimatedRide'
import type { EstimatedRideGate } from '../digest/estimatedRide'
import { massesOf } from '../digest/masses'
import { orderedCurrent } from '../digest/ordered'
import { EVERY_EFFORT } from '../digest/readingRule'
import type { ReadingRule } from '../digest/readingRule'
import { pointWkg } from '../digest/rideCurves'
import { metabolicToFlatSpeed } from '../metabolic'
import type { ActivityDigest, AthleteSettings, BikeModel, Sport } from '../types'

const INDEX_OF = new Map<number, number>(DURATIONS_S.map((durationS, i) => [durationS, i]))

/**
 * What an effort is compared in, by sport: a run in flat speed (m/s, which the page writes as a pace), a ride in
 * W/kg (watts at one mass; with dated masses it is the rule the ride curve picks its best by). A best is the highest
 * of these, so the periods' bests are the maxima of the readings below.
 */
const COMPARED: Record<Sport, (wkg: number) => number> = {
  run: metabolicToFlatSpeed,
  ride: (wkg) => wkg,
}

/** The readings of one length: each activity's value, and whether a power meter measured it. */
export interface DurationReadings {
  values: number[]
  /** Parallel to `values`. Only a ride from a power meter is measured: virtual power never is, and a run is not a ride. */
  measured: boolean[]
}

/** Every activity's reading at each curve duration, by sport: `byDuration[i]` is for DURATIONS_S[i]. */
export type Readings = Record<Sport, DurationReadings[]>

const empty = (): DurationReadings[] => DURATIONS_S.map(() => ({ values: [], measured: [] }))

/**
 * Each activity's best effort at or above each curve duration, priced as the curves are: the activity's own curve
 * is already a monotone envelope, so the best of a period at a length is the highest reading of its activities
 * there. An estimated ride point that stands at its own length only counts at that length (see ESTIMATED_RIDE),
 * and one the gate drops does not count. What counts at all is `rule`'s, the one the curves' bests are made through.
 */
export function readingsOf(
  digests: ActivityDigest[],
  settings: AthleteSettings,
  bikeModel: BikeModel,
  gate: EstimatedRideGate | null | undefined,
  rule: ReadingRule = EVERY_EFFORT,
): Readings {
  const masses = massesOf(settings)
  const standing = estimatedStanding(gate ?? null)
  const out: Readings = { run: empty(), ride: empty() }
  for (const digest of orderedCurrent(digests)) {
    if (!rule.activity(digest)) continue
    const points = digest.curve.map((point) =>
      rule.point(digest, point)
        ? pointWkg(point, digest, masses, bikeModel, standing)
        : { wkg: Number.NaN, watts: Number.NaN, alone: false },
    )
    const measured = digest.powerSource === 'measured'
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
      if (!(value > 0)) continue
      const target = out[digest.sport][index]!
      target.values.push(value)
      target.measured.push(measured)
    }
  }
  return out
}
