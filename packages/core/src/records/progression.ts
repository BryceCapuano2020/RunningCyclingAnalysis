import { DURATIONS_S } from '../constants'
import type { Masses } from '../digest/masses'
import { effortsCount } from '../digest/effortTrust'
import { massesOf } from '../digest/masses'
import { orderedFor } from '../digest/consumers'
import { ofSport } from '../digest/ordered'
import { estimatedStanding, ownRideGate, pointAt } from '../digest/estimatedRide'
import type { EstimatedRideGate, EstimatedStanding } from '../digest/estimatedRide'
import { fitBikeModelOver, pointWkg, runCentralWkg } from '../digest/rideCurves'
import type { ActivityDigest, AthleteSettings, BikeModel, DigestCurvePoint, Sport } from '../types'

/** What a reading's value is: a run's gross metabolic W/kg at its pace, a ride's watts, or with dated body masses its W/kg. */
export type ProgressionUnit = 'run W/kg' | 'W' | 'W/kg'

/** One activity's priced point at a duration: the value its sport compares by, and whether it is an estimate that stands alone. */
export interface Priced {
  value: number
  alone: boolean
}

/** Prices a curve point for comparing activities of one sport. */
export type Pricer = (point: DigestCurvePoint, digest: ActivityDigest) => Priced

/** An activity's priced point at one duration, dated, for the record and for how a best moved over time. */
export interface Reading {
  id: string
  startMs: number
  value: number
  alone: boolean
}

/** A run is compared in gross metabolic W/kg at its pace and holds no estimate. */
export const runPricer: Pricer = (point) => ({ value: runCentralWkg(point), alone: false })

/**
 * A ride's point for comparing rides: its watts, or with dated body masses its watts per kilogram of the body mass on
 * its day, so the record is held by the same ride the best-effort curve shows. NaN for an estimate the athlete's heart
 * rate does not back (see ESTIMATED_RIDE), which holds no record. `alone` is an estimate with no heart rate that
 * stands at its own duration only.
 */
export function ridePricer(
  masses: Masses,
  bikeModel: BikeModel,
  standing: EstimatedStanding,
): Pricer {
  return (point, digest) => {
    const { wkg, watts, alone } = pointWkg(point, digest, masses, bikeModel, standing)
    // A run has no watts (NaN), and a dropped ride is NaN in either unit, so NaN watts read as W/kg.
    return { value: masses.dated || Number.isNaN(watts) ? wkg : watts, alone }
  }
}

/**
 * The record among one duration's readings, given the record at the nearest shorter duration that has one (`shorter`,
 * infinity with none): the highest reading, where an estimate that stands alone counts only when it is no higher than
 * `shorter`, as on the curve, so a longer duration never reads higher than a shorter one. A tie goes to the earlier reading.
 */
export function recordAt(readings: readonly Reading[], shorter: number): Reading | null {
  const bests = { held: null as Reading | null, alone: null as Reading | null }
  for (const reading of readings) {
    const kind = reading.alone ? 'alone' : 'held'
    if (reading.alone && reading.value > shorter) continue
    if (bests[kind] === null || reading.value > bests[kind].value) bests[kind] = reading
  }
  const { held, alone } = bests
  return alone !== null && (held === null || alone.value > held.value) ? alone : held
}

/**
 * The readings that can stand in a history of bests: an estimate that stands alone, higher than the record at the
 * nearest shorter duration, is left out, as the records leave it out, so a history never shows a best the records did
 * not award.
 */
export function withoutOverreach(readings: Reading[][]): Reading[][] {
  let shorter = Number.POSITIVE_INFINITY
  return readings.map((atDuration) => {
    const record = recordAt(atDuration, shorter)
    const kept = atDuration.filter((r) => !(r.alone && r.value > shorter))
    if (record !== null) shorter = record.value
    return kept
  })
}

/** A sport's readings at each duration (`readings[i]` is for DURATIONS_S[i]) and what their values are. */
export interface Progression {
  unit: ProgressionUnit
  readings: Reading[][]
}

/**
 * Every activity's finite priced point at each curve duration (`result[i]` is for DURATIONS_S[i]), in the order the
 * activities are given. The holders of the records and the history of a best are both read from this.
 */
export function readingsByDuration(
  own: ActivityDigest[],
  price: Pricer,
  only?: readonly number[],
): Reading[][] {
  return DURATIONS_S.map((_, index) => {
    const readings: Reading[] = []
    if (only !== undefined && !only.includes(index)) return readings
    for (const digest of own) {
      const point = pointAt(digest, index)
      if (!point) continue
      const { value, alone } = price(point, digest)
      if (Number.isFinite(value))
        readings.push({ id: digest.id, startMs: digest.startMs, value, alone })
    }
    return readings
  })
}

/**
 * The efforts that count for a record, in canonical order. A treadmill run holds no record (see effortsCount), though
 * its own times still show on its page.
 */
export function eligibleDigests(digests: ActivityDigest[]): ActivityDigest[] {
  return orderedFor('records', digests).filter(effortsCount)
}

/**
 * Each sport's priced points at each duration across a set of digests, the records' own eligibility and pricing
 * (runs in W/kg at their pace, rides in watts priced with the bike model fitted to this set, or W/kg with dated masses;
 * `unit` says which), less the estimates the records would not award (see withoutOverreach). `gate` is as for
 * `recordHolders`. A reader that needs only some durations names their indexes in `runOnly`: a run's readings are read at
 * those alone (a run holds no estimate that stands alone, so no duration's readings depend on a shorter one's), and the
 * others are left empty. Rides are always read at every duration, since an estimate there is judged against the next shorter.
 */
export function effortProgression(
  digests: ActivityDigest[],
  settings: AthleteSettings,
  gate?: EstimatedRideGate | null,
  runOnly?: readonly number[],
): Record<Sport, Progression> {
  const ordered = orderedFor('records', digests)
  const masses = massesOf(settings)
  const bikeModel = fitBikeModelOver(ordered, masses).model
  const standing = estimatedStanding(gate === undefined ? ownRideGate(ordered) : gate)
  const eligible = ordered.filter(effortsCount)
  return {
    run: {
      unit: 'run W/kg',
      readings: withoutOverreach(readingsByDuration(ofSport(eligible, 'run'), runPricer, runOnly)),
    },
    ride: {
      unit: masses.dated ? 'W/kg' : 'W',
      readings: withoutOverreach(
        readingsByDuration(ofSport(eligible, 'ride'), ridePricer(masses, bikeModel, standing)),
      ),
    },
  }
}
