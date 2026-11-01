import { DURATIONS_S } from '../constants'
import { estimatedStanding } from '../digest/estimatedRide'
import type { EstimatedRideGate } from '../digest/estimatedRide'
import { massesOf } from '../digest/masses'
import { orderedFor } from '../digest/consumers'
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

/** What a point the rule leaves out is priced at. */
const NOT_COUNTED = { wkg: Number.NaN, watts: Number.NaN, alone: false }

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
  /** A reader of the longer lengths only: the curve points shorter than this many seconds are not priced, and the readings at and above it are the same (a length's reading depends on the longer ones only). */
  shortestS = 0,
): Readings {
  const masses = massesOf(settings)
  const standing = estimatedStanding(gate ?? null)
  const out: Readings = { run: empty(), ride: empty() }
  for (const digest of orderedFor('change', digests)) {
    if (!rule.activity(digest)) continue
    const curve = digest.curve
    const measured = digest.powerSource === 'measured'
    const target = out[digest.sport]
    // From the longest length down: `held` is the best of the points that count at every shorter length too. A point
    // shorter than `shortestS` is not priced and does not take part.
    let held = Number.NEGATIVE_INFINITY
    for (let i = curve.length - 1; i >= 0; i--) {
      const point = curve[i]!
      if (shortestS > 0 && !(point.durationS >= shortestS)) continue
      const { wkg, alone } = rule.point(digest, point)
        ? pointWkg(point, digest, masses, bikeModel, standing)
        : NOT_COUNTED
      const finite = Number.isFinite(wkg)
      if (finite && !alone && wkg > held) held = wkg
      const here = finite && alone ? Math.max(held, wkg) : held
      const index = INDEX_OF.get(point.durationS)
      if (index === undefined || !Number.isFinite(here)) continue
      const value = COMPARED[digest.sport](here)
      if (!(value > 0)) continue
      target[index]!.values.push(value)
      target[index]!.measured.push(measured)
    }
  }
  return out
}
