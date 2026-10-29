import { HR_BLOCK_S, PRIORS, RESTING_W_PER_KG } from '../constants'
import { possibleRunWkg } from '../curves'
import type { EffortPoint } from '../effort'
import type {
  ActivityDigest,
  AthleteSettings,
  BikeModel,
  Curve,
  DigestCurvePoint,
  DigestHrBlock,
  HrPoint,
  SportCurves,
} from '../types'
import { fitBikeModel } from '../virtualPower'
import { bestOf, bestOfEach, isMeasured, plainCurve } from './bestCurve'
import { CalibrationPool, calibratedOf } from './calibration'
import { effortsCount } from './effortTrust'
import type { Masses } from './masses'
import { massesOf } from './masses'
import { orderedCurrent } from './ordered'
import { powerAt } from './terms'

/**
 * Gross metabolic W/kg of a run curve point at the prior-mean running economy, or NaN when the point
 * is faster than the world-record ceiling for its duration. Every best built from a digest's run
 * points reads them through here, so an impossible point is left out of all of them.
 */
export function runCentralWkg(point: DigestCurvePoint): number {
  return possibleRunWkg(point.durationS, point.value)
}

/** Mechanical watts of a ride curve point at total mass totalMassKg, with the fitted bike model. */
export function rideWattsAt(
  point: DigestCurvePoint,
  totalMassKg: number,
  bikeModel: BikeModel,
): number {
  return point.terms === null ? point.value : powerAt(point.terms, totalMassKg, bikeModel)
}

/** Gross metabolic W/kg for riding at mechanical watts, at the prior-mean efficiency. */
export function centralWkgFromWatts(watts: number, massKg: number): number {
  return watts / (PRIORS.grossEfficiency.mean * massKg)
}

/**
 * The bike model fitted to every power-meter ride in ordered. Each ride is fitted at the total mass
 * it rode at, so a ride from a year ago is not refitted at today's weight.
 */
export function fitBikeModelOver(ordered: ActivityDigest[], masses: Masses) {
  const pool = new CalibrationPool(calibratedOf(ordered), (digest) => masses.totalKg(digest))
  return fitBikeModel(pool.stats())
}

/** A ride point priced as gross metabolic W/kg at the mass of its activity. */
function rideWkgAt(
  point: DigestCurvePoint,
  digest: ActivityDigest,
  masses: Masses,
  model: BikeModel,
): number {
  const watts = rideWattsAt(point, masses.totalKg(digest), model)
  return centralWkgFromWatts(watts, masses.bodyKg(digest))
}

/** The run and ride curves a combine works from, with the ride in each unit it needs. */
export interface BestCurves {
  runBest: EffortPoint[]
  /**
   * The ride in watts. Without dated masses it is the best watts at each duration. With them it is
   * the watts of the best power-to-weight ride at each duration, so its activity, heart rate and
   * window are those of rideMetabolic, and every use of the two agrees on one ride.
   */
  rideBest: EffortPoint[]
  /** The ride as gross metabolic W/kg: the best power-to-weight, each ride at its own body mass. */
  rideMetabolic: Curve
  /**
   * The ride as watts for the run-versus-ride comparison, which divides by todayKg. With one mass for
   * every activity it is the best watts. With dated masses it is the best power-to-weight expressed
   * at todayKg, so the comparison still reads each ride at the mass it was ridden at.
   */
  rideComparable: Curve
  /** The body mass of each activity by id, kg. Empty without dated masses, when todayKg is every mass. */
  bodyKgById: Map<string, number>
}

/**
 * The best run and ride values at each duration. Rides are priced with bikeModel. A treadmill run holds
 * no best (see effortsCount), so it is left out of both curves.
 */
export function bestCurves(
  all: ActivityDigest[],
  masses: Masses,
  bikeModel: BikeModel,
  todayKg: number,
): BestCurves {
  const ordered = all.filter(effortsCount)
  const runBest = bestOf(ordered, 'run', runCentralWkg)
  if (!masses.dated) {
    const rideBest = bestOfEach(ordered, 'ride', (digest) => {
      const total = masses.totalKg(digest)
      return (point) => rideWattsAt(point, total, bikeModel)
    })
    const rideCurve = plainCurve(rideBest)
    const rideMetabolic = rideCurve.map((p) => ({
      ...p,
      value: centralWkgFromWatts(p.value, todayKg),
    }))
    return { runBest, rideBest, rideMetabolic, rideComparable: rideCurve, bodyKgById: new Map() }
  }
  // The best ride at a duration is the best power-to-weight, and its watts follow from its own mass.
  const wkgBest = bestOfEach(
    ordered,
    'ride',
    (digest) => (point) => rideWkgAt(point, digest, masses, bikeModel),
  )
  const bodyKgById = new Map(ordered.map((digest) => [digest.id, masses.bodyKg(digest)]))
  const efficiency = PRIORS.grossEfficiency.mean
  const rideBest = wkgBest.map((point) =>
    Object.assign({}, point, {
      value: point.value * efficiency * (bodyKgById.get(point.activityId ?? '') ?? Number.NaN),
    }),
  )
  const rideMetabolic = plainCurve(wkgBest)
  const rideComparable = rideMetabolic.map((p) => ({ ...p, value: p.value * efficiency * todayKg }))
  return { runBest, rideBest, rideMetabolic, rideComparable, bodyKgById }
}

/** The best watts at each duration among the rides with a power meter, which need no bike model. */
export function measuredRideBest(ordered: ActivityDigest[]): EffortPoint[] {
  return bestOf(ordered, 'ride', (point) => point.value, isMeasured)
}

/**
 * The run and ride curves of a set of digests, without the rest of the analysis. Rides are priced
 * with bikeModel, passed in so that two periods share one model and a change of model cannot read
 * as a change of fitness.
 */
export function sportCurves(
  digests: ActivityDigest[],
  settings: AthleteSettings,
  bikeModel: BikeModel,
): SportCurves {
  const masses = massesOf(settings)
  const { runBest, rideBest } = bestCurves(
    orderedCurrent(digests),
    masses,
    bikeModel,
    settings.massKg,
  )
  return { runCurve: plainCurve(runBest), rideCurve: plainCurve(rideBest) }
}

/**
 * The heart-rate points of the runs and rides in ordered, each at its central metabolic power. A run
 * block faster than the world-record ceiling for its five minutes is not a possible effort, so it is
 * left out, as a curve point is. A block is kept only when its metabolic power is above twice resting.
 * The filter is applied after conversion, so it means the same thing for runs and rides.
 */
export function heartRatePoints(
  ordered: ActivityDigest[],
  masses: Masses,
  bikeModel: BikeModel,
): { runPoints: HrPoint[]; ridePoints: HrPoint[] } {
  const blockMetabolic = (digest: ActivityDigest, block: DigestHrBlock): number => {
    if (digest.sport === 'run') return possibleRunWkg(HR_BLOCK_S, block.value)
    const watts =
      block.terms === null ? block.value : powerAt(block.terms, masses.totalKg(digest), bikeModel)
    return centralWkgFromWatts(watts, masses.bodyKg(digest))
  }
  const runPoints: HrPoint[] = []
  const ridePoints: HrPoint[] = []
  for (const digest of ordered) {
    // Treadmill pace is not a power, so a treadmill run's heart rate says nothing of the two sports' efficiency.
    if (!effortsCount(digest)) continue
    for (const block of digest.hrBlocks) {
      const metabolicPower = blockMetabolic(digest, block)
      if (!(metabolicPower >= 2 * RESTING_W_PER_KG)) continue
      const point: HrPoint = { metabolicPower, heartRate: block.heartRate, activityId: digest.id }
      if (digest.sport === 'run') runPoints.push(point)
      else ridePoints.push(point)
    }
  }
  return { runPoints, ridePoints }
}
