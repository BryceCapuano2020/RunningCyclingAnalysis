import {
  DURATIONS_S,
  HEADLINE_DURATION_S,
  HR_BLOCK_S,
  PRIORS,
  RESTING_W_PER_KG,
} from '../constants'
import { possibleRunWkg } from '../curves'
import { checkEfforts, judgedTwentyMinutes } from '../effort'
import type { EffortPoint, EffortReference, TwentyMinutePoint } from '../effort'
import type {
  ActivityDigest,
  AthleteSettings,
  BikeModel,
  Curve,
  DigestCurvePoint,
  DigestHrBlock,
  HrPoint,
  SportCurves,
  Sport,
} from '../types'
import { fitBikeModel } from '../virtualPower'
import { bestOf, bestOfEach, isMeasured, plainCurve } from './bestCurve'
import { CalibrationPool, calibratedOf } from './calibration'
import { memoByDigests } from '../digestMemo'
import { effortsCount } from './effortTrust'
import { EVERY_EFFORT } from './readingRule'
import type { ReadingRule } from './readingRule'
import { estimatedStanding, ownRideGate } from './estimatedRide'
import type { EstimatedRideGate, EstimatedStanding } from './estimatedRide'
import type { Masses } from './masses'
import { massesOf } from './masses'
import { orderedFor } from './consumers'
import { ofSport } from './ordered'
import { powerCheckOf, trustedPower } from './powerCheck'
import { powerAt } from './terms'
import { withoutSetAside } from './trustedHeartRate'

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
  // A ride whose power is set aside is not a calibration of the bike: a wrong meter would bend the fit.
  const pool = new CalibrationPool(calibratedOf(trustedPower(ordered, masses)), (digest) =>
    masses.totalKg(digest),
  )
  return fitBikeModel(pool.stats())
}

/**
 * One ride point priced: its mechanical watts, NaN when it is an estimate the athlete's heart rate does not back
 * (see ESTIMATED_RIDE), and whether it stands at its own duration only, as an unbacked estimate does.
 */
export function ridePriced(
  point: DigestCurvePoint,
  digest: ActivityDigest,
  masses: Masses,
  model: BikeModel,
  standing: EstimatedStanding,
): { watts: number; alone: boolean } {
  if (powerCheckOf(digest, masses) === 'set-aside') return { watts: Number.NaN, alone: false }
  // A power meter's reading is its value: the mass is asked for only where the power is estimated.
  const watts =
    point.terms === null ? point.value : powerAt(point.terms, masses.totalKg(digest), model)
  const how = standing(point, watts)
  return { watts: how === 'drops' ? Number.NaN : watts, alone: how === 'stands' }
}

/**
 * One curve point of any sport priced in gross metabolic W/kg, the unit every comparison shares. A run
 * point is read at the prior-mean running economy (NaN past the world-record ceiling); a ride point at
 * the prior-mean efficiency, from its priced watts and the body mass of its day. `watts` is the ride's
 * mechanical watts and NaN for a run; `alone` as in ridePriced. The one place a point becomes W/kg, so the
 * trend, the records, the curves and the heart-rate judgement price a point the same way.
 */
export function pointWkg(
  point: DigestCurvePoint,
  digest: ActivityDigest,
  masses: Masses,
  model: BikeModel,
  standing: EstimatedStanding,
): { wkg: number; watts: number; alone: boolean } {
  if (digest.sport === 'run') return { wkg: runCentralWkg(point), watts: Number.NaN, alone: false }
  const { watts, alone } = ridePriced(point, digest, masses, model, standing)
  return { wkg: centralWkgFromWatts(watts, masses.bodyKg(digest)), watts, alone }
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
 * The best run values of runs read by every effort that counts. A run is priced from its pace alone, so a change of body
 * mass, bike model or estimated-ride gate takes the curve already worked out for the same runs. A copy, for a caller that
 * changes it.
 */
const everyRunBest = memoByDigests(
  (runs: ActivityDigest[], _input: null) => bestOfEach(runs, 'run', () => runCentralWkg),
  () => true,
  (curve) => curve.map((point) => ({ ...point })),
)

/**
 * The best run and ride values at each duration. Rides are priced with bikeModel, and an estimated ride point
 * counts only if `gate` lets it (see ESTIMATED_RIDE); null leaves every point, as with too few measured rides. What counts
 * as a reading at all is `rule`'s (a treadmill run holds no best, see effortsCount): the change test reads efforts through
 * the same rule.
 */
export function bestCurves(
  all: ActivityDigest[],
  masses: Masses,
  bikeModel: BikeModel,
  todayKg: number,
  gate: EstimatedRideGate | null,
  rule: ReadingRule = EVERY_EFFORT,
): BestCurves {
  const ordered = all.filter(rule.activity)
  // A point the rule leaves out is not found, as one the ceiling drops is not.
  const counted =
    (digest: ActivityDigest, value: (point: DigestCurvePoint) => number) =>
    (point: DigestCurvePoint): number =>
      rule.point(digest, point) ? value(point) : Number.NaN
  const runs = ofSport(ordered, 'run')
  const runBest =
    rule === EVERY_EFFORT
      ? everyRunBest(runs, null)
      : bestOfEach(runs, 'run', (digest) => counted(digest, runCentralWkg))
  const standing = estimatedStanding(gate)
  // Without a gate every point holds, so none stands alone.
  const aloneFor =
    gate === null
      ? undefined
      : (digest: ActivityDigest) => (point: DigestCurvePoint) =>
          ridePriced(point, digest, masses, bikeModel, standing).alone
  if (!masses.dated) {
    const rideBest = bestOfEach(
      ordered,
      'ride',
      (digest) =>
        counted(digest, (point) => ridePriced(point, digest, masses, bikeModel, standing).watts),
      undefined,
      aloneFor,
    )
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
    (digest) =>
      counted(digest, (point) => pointWkg(point, digest, masses, bikeModel, standing).wkg),
    undefined,
    aloneFor,
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
  return measuredBest(ofSport(ordered, 'ride').filter(isMeasured), null)
}

/** The measured rides read no mass or model, so the same rides give the curve already worked out. */
const measuredBest = memoByDigests(
  (measured: ActivityDigest[], _input: null) => bestOf(measured, 'ride', (point) => point.value),
  () => true,
  (curve) => curve.map((point) => ({ ...point })),
)

/** Whether a sport's 20 minute value is a measurement: a run's pace is, a ride's watts only from a power meter. */
const MEASURED: Record<Sport, (digest: ActivityDigest) => boolean> = {
  run: () => true,
  ride: (digest) => digest.powerSource === 'measured',
}

/** The index of the 20 minute best among a digest's durations. */
const HEADLINE_INDEX = DURATIONS_S.indexOf(HEADLINE_DURATION_S)

/**
 * Each sport's activities' 20 minute bests in the fit's unit (gross metabolic W/kg) with the heart rate over each window,
 * for the activities whose efforts count. A heart rate that is set aside is none. These are what the effort gate chooses
 * the effort to judge from: the best, and any within the fit's reach tolerance of it.
 */
export function twentyMinutePoints(
  ordered: readonly ActivityDigest[],
  masses: Masses,
  bikeModel: BikeModel,
  gate: EstimatedRideGate | null,
  setAside: ReadonlySet<string>,
): Record<Sport, TwentyMinutePoint[]> {
  const standing = estimatedStanding(gate)
  const out: Record<Sport, TwentyMinutePoint[]> = { run: [], ride: [] }
  for (const digest of ordered) {
    const point = digest.curve[HEADLINE_INDEX]
    if (point === undefined || !effortsCount(digest)) continue
    const value =
      digest.sport === 'ride'
        ? centralWkgFromWatts(
            ridePriced(point, digest, masses, bikeModel, standing).watts,
            masses.bodyKg(digest),
          )
        : runCentralWkg(point)
    if (!Number.isFinite(value)) continue
    out[digest.sport].push({
      value,
      heartRate: setAside.has(digest.id) ? null : point.heartRate,
      measured: MEASURED[digest.sport](digest),
    })
  }
  return out
}

/**
 * The run and ride curves of a set of digests, without the rest of the analysis. Rides are priced
 * with bikeModel, passed in so that two periods share one model and a change of model cannot read
 * as a change of fitness. `gate` is the library's (see ESTIMATED_RIDE); absent, it is read from these digests.
 * With `hardness`, the result also says how hard the best 20 minutes were by heart rate, judged against the
 * library's reference heart rates and set-aside list exactly as a period's own effort check is.
 */
export function sportCurves(
  digests: ActivityDigest[],
  settings: AthleteSettings,
  bikeModel: BikeModel,
  gate?: EstimatedRideGate | null,
  hardness?: { effort: EffortReference; setAside: ReadonlySet<string> },
): SportCurves {
  const masses = massesOf(settings)
  const ordered = orderedFor('rideCurves', digests)
  const rideGate = gate === undefined ? ownRideGate(trustedPower(ordered, masses)) : gate
  const { runBest, rideBest } = bestCurves(ordered, masses, bikeModel, settings.massKg, rideGate)
  const curves = { runCurve: plainCurve(runBest), rideCurve: plainCurve(rideBest) }
  if (hardness === undefined) return curves
  const setAside = new Set(hardness.setAside)
  const [effort] = checkEfforts(
    withoutSetAside(runBest, setAside),
    withoutSetAside(rideBest, setAside),
    hardness.effort.referenceHr,
    [HEADLINE_DURATION_S],
    hardness.effort,
  )
  // The check judges the effort the gate does: the one with the highest heart rate among the 20 minute bests.
  const points = twentyMinutePoints(ordered, masses, bikeModel, rideGate, setAside)
  const share = (sport: Sport) => {
    const { heartRate } = judgedTwentyMinutes(points[sport])
    const reference = hardness.effort.referenceHr[sport]
    return heartRate !== null && reference !== null && reference > 0 ? heartRate / reference : null
  }
  const runShare = share('run')
  const rideShare = share('ride')
  return {
    ...curves,
    headlineEffort: {
      ...effort!,
      runHrFraction: runShare ?? effort!.runHrFraction,
      rideHrFraction: rideShare ?? effort!.rideHrFraction,
    },
  }
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
    // A ride whose power is set aside gives no point either: its watts would bend the heart-rate line.
    if (powerCheckOf(digest, masses) === 'set-aside') return Number.NaN
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
