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
 * Every activity's finite priced point at each curve duration (`result[i]` is for DURATIONS_S[i]), in the order the
 * activities are given. The holders of the records and the history of a best are both read from this.
 */
export function readingsByDuration(own: ActivityDigest[], price: Pricer): Reading[][] {
  return DURATIONS_S.map((_, index) => {
    const readings: Reading[] = []
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
 * Each sport's priced points at each duration across a set of digests, the records' own eligibility and pricing:
 * runs in W/kg at their pace, rides in watts priced with the bike model fitted to this set. `gate` is as for
 * `recordHolders`.
 */
export function effortProgression(
  digests: ActivityDigest[],
  settings: AthleteSettings,
  gate?: EstimatedRideGate | null,
): Record<Sport, Reading[][]> {
  const ordered = orderedFor('records', digests)
  const masses = massesOf(settings)
  const bikeModel = fitBikeModelOver(ordered, masses).model
  const standing = estimatedStanding(gate === undefined ? ownRideGate(ordered) : gate)
  const eligible = ordered.filter(effortsCount)
  return {
    run: readingsByDuration(ofSport(eligible, 'run'), runPricer),
    ride: readingsByDuration(ofSport(eligible, 'ride'), ridePricer(masses, bikeModel, standing)),
  }
}
