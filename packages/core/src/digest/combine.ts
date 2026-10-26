import { compareSports, weightedQuantiles } from '../compare'
import { calibrationWeights, drawPriors } from '../compare/sampling'
import {
  DURATIONS_S,
  EQUIVALENCE_DURATIONS_S,
  FLAT_RUN_COST,
  PRIORS,
  RESTING_W_PER_KG,
} from '../constants'
import { mergeCurves, monotoneEnvelope } from '../curves'
import { fitCriticalPower } from '../cp'
import type { EffortPoint } from '../effort'
import { checkEfforts, referenceMaxHeartRates } from '../effort'
import { crossCheck } from '../hr'
import { requirePositiveFinite } from '../math'
import type {
  ActivityDigest,
  AthleteSettings,
  SportCurves,
  BikeModel,
  CalibrationSums,
  Comparison,
  CriticalPowerFit,
  Curve,
  DigestCurvePoint,
  DigestHrBlock,
  EffortCheck,
  HrCrossCheck,
  HrPoint,
  Interval,
  VirtualPowerAccuracy,
} from '../types'
import { MODEL_REVISION } from './modelRevision'
import { summaryOf, type ActivitySummary } from './summary'
import { fitBikeModel } from '../virtualPower'
import type { BikeModelSource } from '../virtualPower'
import { addCalibrationSums, calibrationStatsAt, emptyCalibrationSums } from './calibration'
import { leaveOneOutAccuracy } from './accuracy'
import type { Calibrated } from './accuracy'
import { powerAt } from './terms'

export interface Equivalence {
  durationS: number
  /** Best mechanical power held for durationS, W. */
  ridePowerW: number
  /** Flat running speed with the same gross metabolic power, m/s. */
  runSpeed: Interval
}

export type { BikeModelSource }

/**
 * Analysis of a set of digests. Best values follow one rule. Measured values (runs, and rides
 * with a power meter) are fixed per activity, so adding an activity never lowers a measured best.
 * Values for rides without a power meter are priced with `bikeModel`, which is refitted from every
 * power-meter ride in the same set. Adding a power-meter ride can therefore move those values in
 * either direction. `bikeModelSource` says whether the fit or the default model was used.
 */
export interface AnalysisResult {
  activities: ActivitySummary[]
  /** Best gross metabolic power while running, W/kg, at the prior-mean economy. */
  runCurve: Curve
  /** Best mechanical power while riding, W. See the note above on rides without a power meter. */
  rideCurve: Curve
  /** rideCurve expressed as gross metabolic W/kg at the prior-mean efficiency. */
  rideMetabolicCurve: Curve
  runCp: CriticalPowerFit | null
  rideCp: CriticalPowerFit | null
  hr: HrCrossCheck
  comparison: Comparison
  equivalents: Equivalence[]
  /** Highest sustained heart rate on file, bpm; null without heart-rate data. */
  maxHeartRate: number | null
  /** Heart rate that running efforts are judged against, bpm; null without heart-rate data. */
  runMaxHeartRate: number | null
  /** Heart rate that cycling efforts are judged against, bpm; null without heart-rate data. */
  rideMaxHeartRate: number | null
  /** Highest running heart rate on file, bpm; null without running heart-rate data. */
  runObservedMaxHeartRate: number | null
  /** Highest cycling heart rate on file, bpm; null without cycling heart-rate data. */
  rideObservedMaxHeartRate: number | null
  /** Whether each compared best effort was close to all-out, one entry per comparison duration. */
  effort: EffortCheck[]
  bikeModel: BikeModel
  /** 'calibrated' when bikeModel was fitted to power-meter rides, else 'default'. */
  bikeModelSource: BikeModelSource
  /** Leave-one-ride-out accuracy of the virtual power meter; null with no power-meter rides. */
  virtualAccuracy: VirtualPowerAccuracy | null
}

const DRAWS = 4000
const SEED = 1

/**
 * The flat running speed that costs the same gross metabolic power as riding at a given power,
 * for one heart-rate model. The efficiency draws and their heart-rate weights depend only on the
 * model, so they are built once here, and each power costs one pass over them.
 */
export function equivalenceFor(
  hr: HrCrossCheck | null,
  opts: { draws?: number; seed?: number } = {},
): (ridePowerW: number, massKg: number) => Interval {
  const draws = opts.draws ?? DRAWS
  const { ge, s } = drawPriors(draws, opts.seed ?? SEED)
  const calibration = calibrationWeights(ge, s, hr)
  const weights = calibration?.accepted ? calibration.weights : new Float64Array(draws).fill(1)
  return (ridePowerW, massKg) => {
    const speeds = new Float64Array(draws)
    for (let i = 0; i < draws; i++) {
      const metabolic = ridePowerW / (ge[i]! * massKg)
      speeds[i] = Math.max(0, (metabolic - RESTING_W_PER_KG) / (s[i]! * FLAT_RUN_COST))
    }
    // One sort gives all three percentiles, exactly as three separate calls would.
    const [p05, p50, p95] = weightedQuantiles(speeds, weights, [0.05, 0.5, 0.95])
    return { p05: p05!, p50: p50!, p95: p95! }
  }
}

/**
 * Flat running speed that costs the same gross metabolic power as riding at
 * `ridePowerW`, with uncertainty from the efficiency priors and, when
 * available, the heart-rate cross-check.
 */
export function equivalentRunSpeed(
  ridePowerW: number,
  massKg: number,
  hr: HrCrossCheck | null,
  opts: { draws?: number; seed?: number } = {},
): Interval {
  return equivalenceFor(hr, opts)(ridePowerW, massKg)
}

/**
 * Heart-rate points at or below critical power. Heart rate is only regressed where it still rises
 * with power. Without a fit, every point is kept.
 */
export function atOrBelowCriticalPower(points: HrPoint[], cp: CriticalPowerFit | null): HrPoint[] {
  if (cp === null) return points
  return points.filter((p) => p.metabolicPower <= cp.cp)
}

/** Orders digests by start time, then id, so results do not depend on the order they arrive in. */
function canonicalOrder(a: ActivityDigest, b: ActivityDigest): number {
  if (a.startMs !== b.startMs) return a.startMs - b.startMs
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * The digests of the active model revision, in canonical order. Mixing revisions would combine
 * stale and current assumptions, so the other revisions are left out everywhere.
 */
export function orderedCurrent(digests: ActivityDigest[]): ActivityDigest[] {
  return digests.filter((digest) => digest.modelRevision === MODEL_REVISION).sort(canonicalOrder)
}

/** Gross metabolic W/kg of a run curve point at the prior-mean running economy. */
export function runCentralWkg(point: DigestCurvePoint): number {
  return point.value
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

/** The calibration sums of every power-meter ride in ordered, added in that order. */
export function totalCalibration(ordered: ActivityDigest[]): CalibrationSums {
  return ordered.reduce(
    (acc, digest) =>
      digest.calibration === null ? acc : addCalibrationSums(acc, digest.calibration),
    emptyCalibrationSums(),
  )
}

/** The bike model fitted to total calibration sums, priced at totalMassKg. */
export function fitBikeModelFor(totalSums: CalibrationSums, totalMassKg: number) {
  return fitBikeModel(calibrationStatsAt(totalSums, totalMassKg))
}

/** One activity's curve points, with values already in the units of the combined curve. */
function candidates(
  digest: ActivityDigest,
  valueOf: (point: DigestCurvePoint) => number,
): EffortPoint[] {
  return digest.curve.map((p) => {
    const value = valueOf(p)
    const found = !Number.isNaN(value)
    return {
      durationS: p.durationS,
      value,
      activityId: found ? digest.id : null,
      startIndex: found ? p.startIndex : -1,
      heartRate: found ? p.heartRate : null,
    }
  })
}

function emptyCurve(): EffortPoint[] {
  return DURATIONS_S.map((durationS) => ({
    durationS,
    value: NaN,
    activityId: null,
    startIndex: -1,
    heartRate: null,
  }))
}

/** Pointwise best across activities, then the monotone envelope. Empty when there are none. */
function bestCurve(curves: EffortPoint[][]): EffortPoint[] {
  return curves.length > 0 ? monotoneEnvelope(mergeCurves(curves)) : emptyCurve()
}

function plainCurve(points: EffortPoint[]): Curve {
  return points.map(({ durationS, value, activityId, startIndex }) => ({
    durationS,
    value,
    activityId,
    startIndex,
  }))
}

function maxHeartRateOf(digests: ActivityDigest[]): number | null {
  let best: number | null = null
  for (const digest of digests) {
    const value = digest.maxHeartRate
    if (value !== null && (best === null || value > best)) best = value
  }
  return best
}

/** The best run and ride values at each duration. Rides are priced with bikeModel. */
function bestCurves(
  ordered: ActivityDigest[],
  totalMassKg: number,
  bikeModel: BikeModel,
): { runBest: EffortPoint[]; rideBest: EffortPoint[] } {
  const rideWatts = (point: DigestCurvePoint): number => rideWattsAt(point, totalMassKg, bikeModel)
  return {
    runBest: bestCurve(
      ordered.filter((d) => d.sport === 'run').map((d) => candidates(d, runCentralWkg)),
    ),
    rideBest: bestCurve(
      ordered.filter((d) => d.sport === 'ride').map((d) => candidates(d, rideWatts)),
    ),
  }
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
  const totalMassKg = settings.massKg + settings.bikeMassKg
  const { runBest, rideBest } = bestCurves(orderedCurrent(digests), totalMassKg, bikeModel)
  return { runCurve: plainCurve(runBest), rideCurve: plainCurve(rideBest) }
}

/** The activities of a library as summaries, newest first, as the analysis lists them. */
export function activitySummaries(digests: ActivityDigest[]): ActivitySummary[] {
  return orderedCurrent(digests)
    .map(summaryOf)
    .sort((a, b) => b.startMs - a.startMs)
}

/**
 * Combines per-activity digests into the athlete's analysis. Only the bike model, the body and
 * bike masses and the efficiency priors enter here, so the work per settings change is small.
 */
export function combine(digests: ActivityDigest[], settings: AthleteSettings): AnalysisResult {
  requirePositiveFinite('massKg', settings.massKg)
  requirePositiveFinite('bikeMassKg', settings.bikeMassKg)
  const ordered = orderedCurrent(digests)
  const massKg = settings.massKg
  const totalMassKg = settings.massKg + settings.bikeMassKg

  const calibrated: Calibrated[] = ordered.flatMap((digest) =>
    digest.calibration === null ? [] : [{ digest, sums: digest.calibration }],
  )
  const totalSums = totalCalibration(ordered)
  const fittedBike = fitBikeModelFor(totalSums, totalMassKg)
  const bikeModel = fittedBike.model
  const virtualAccuracy =
    calibrated.length > 0 ? leaveOneOutAccuracy(calibrated, totalSums, totalMassKg) : null

  const { runBest, rideBest } = bestCurves(ordered, totalMassKg, bikeModel)
  const runCurve = plainCurve(runBest)
  const rideCurve = plainCurve(rideBest)
  const rideMetabolicCurve = rideCurve.map((p) => ({
    ...p,
    value: centralWkgFromWatts(p.value, massKg),
  }))

  // Blocks are kept only when their metabolic power is above twice resting. This filter is applied
  // after conversion, so it means the same thing for runs and rides.
  const blockMetabolic = (digest: ActivityDigest, block: DigestHrBlock): number => {
    if (digest.sport === 'run') return block.value
    const watts = block.terms === null ? block.value : powerAt(block.terms, totalMassKg, bikeModel)
    return centralWkgFromWatts(watts, massKg)
  }
  const runPoints: HrPoint[] = []
  const ridePoints: HrPoint[] = []
  for (const digest of ordered) {
    for (const block of digest.hrBlocks) {
      const metabolicPower = blockMetabolic(digest, block)
      if (!(metabolicPower >= 2 * RESTING_W_PER_KG)) continue
      const point: HrPoint = { metabolicPower, heartRate: block.heartRate, activityId: digest.id }
      if (digest.sport === 'run') runPoints.push(point)
      else ridePoints.push(point)
    }
  }

  // Heart rate tracks metabolic power linearly only while the effort is aerobic; above critical
  // power it flattens toward maximum. Blocks are selected on power, never on heart rate, because
  // truncating the dependent variable would bias the slopes.
  const runCp = fitCriticalPower(runCurve)
  const rideCp = fitCriticalPower(rideMetabolicCurve)
  const hr = crossCheck(
    atOrBelowCriticalPower(runPoints, runCp),
    atOrBelowCriticalPower(ridePoints, rideCp),
  )
  const comparison = compareSports(runCurve, rideCurve, massKg, hr, {
    draws: DRAWS,
    seed: SEED,
  })

  const equivalents: Equivalence[] = []
  for (const durationS of EQUIVALENCE_DURATIONS_S) {
    const point = rideCurve.find((p) => p.durationS === durationS)
    if (point && Number.isFinite(point.value)) {
      equivalents.push({
        durationS,
        ridePowerW: point.value,
        runSpeed: equivalentRunSpeed(point.value, massKg, hr),
      })
    }
  }

  const maxHr = maxHeartRateOf(ordered)
  const runObservedMax = maxHeartRateOf(ordered.filter((d) => d.sport === 'run'))
  const rideObservedMax = maxHeartRateOf(ordered.filter((d) => d.sport === 'ride'))
  const maxRef = referenceMaxHeartRates(runObservedMax, rideObservedMax)
  const effort = checkEfforts(
    runBest,
    rideBest,
    maxRef,
    comparison.prior.map((p) => p.durationS),
  )

  return {
    activities: activitySummaries(digests),
    runCurve,
    rideCurve,
    rideMetabolicCurve,
    runCp,
    rideCp,
    hr,
    comparison,
    equivalents,
    maxHeartRate: maxHr,
    runMaxHeartRate: maxRef.run,
    rideMaxHeartRate: maxRef.ride,
    runObservedMaxHeartRate: runObservedMax,
    rideObservedMaxHeartRate: rideObservedMax,
    effort,
    bikeModel,
    bikeModelSource: fittedBike.source,
    virtualAccuracy,
  }
}
