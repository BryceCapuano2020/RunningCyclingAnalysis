import { compareSports, weightedQuantile } from '../compare'
import { calibrationWeights, drawPriors } from '../compare/sampling'
import { DURATIONS_S, FLAT_RUN_COST, PRIORS, RESTING_W_PER_KG } from '../constants'
import { mergeCurves, monotoneEnvelope } from '../curves'
import { fitCriticalPower } from '../cp'
import type { EffortPoint } from '../effort'
import { checkEfforts, referenceMaxHeartRates } from '../effort'
import { crossCheck } from '../hr'
import { mean } from '../math'
import type {
  ActivityDigest,
  AthleteSettings,
  BikeModel,
  CalibrationSums,
  Comparison,
  CriticalPowerFit,
  Curve,
  DerivedStreams,
  DigestCurvePoint,
  DigestHrBlock,
  EffortCheck,
  HrCrossCheck,
  HrPoint,
  Interval,
  QualityFlag,
  Sport,
  VirtualPowerAccuracy,
} from '../types'
import { MODEL_REVISION } from './modelRevision'
import { fitBikeModel } from '../virtualPower'
import type { BikeModelSource } from '../virtualPower'
import {
  addCalibrationSums,
  calibrationStatsAt,
  emptyCalibrationSums,
  subtractCalibrationSums,
} from './calibration'
import { powerAt } from './terms'

export interface ActivitySummary {
  id: string
  name: string
  sport: Sport
  startMs: number
  durationS: number
  distanceM: number
  elevationGainM: number
  hasHeartRate: boolean
  powerSource: DerivedStreams['powerSource']
  flags: QualityFlag[]
}

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
  const draws = opts.draws ?? DRAWS
  const { ge, s } = drawPriors(draws, opts.seed ?? SEED)
  const calibration = calibrationWeights(ge, s, hr)
  const speeds = new Float64Array(draws)
  const weights = calibration?.accepted ? calibration.weights : new Float64Array(draws).fill(1)
  for (let i = 0; i < draws; i++) {
    const metabolic = ridePowerW / (ge[i]! * massKg)
    speeds[i] = Math.max(0, (metabolic - RESTING_W_PER_KG) / (s[i]! * FLAT_RUN_COST))
  }
  return {
    p05: weightedQuantile(speeds, weights, 0.05),
    p50: weightedQuantile(speeds, weights, 0.5),
    p95: weightedQuantile(speeds, weights, 0.95),
  }
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

function summaryOf(digest: ActivityDigest): ActivitySummary {
  return {
    id: digest.id,
    name: digest.name,
    sport: digest.sport,
    startMs: digest.startMs,
    durationS: digest.durationS,
    distanceM: digest.distanceM,
    elevationGainM: digest.elevationGainM,
    hasHeartRate: digest.hasHeartRate,
    powerSource: digest.powerSource,
    flags: digest.flags,
  }
}

function maxHeartRateOf(digests: ActivityDigest[]): number | null {
  let best: number | null = null
  for (const digest of digests) {
    const value = digest.maxHeartRate
    if (value !== null && (best === null || value > best)) best = value
  }
  return best
}

interface Calibrated {
  digest: ActivityDigest
  sums: CalibrationSums
}

/**
 * Leave-one-ride-out accuracy: each ride's climb sections are scored with a bike model fitted on
 * the other rides, then the sections are pooled.
 */
function leaveOneOutAccuracy(
  calibrated: Calibrated[],
  totalSums: CalibrationSums,
  massKg: number,
): VirtualPowerAccuracy {
  const segments = calibrated.flatMap(({ digest, sums }) => {
    const others = subtractCalibrationSums(totalSums, sums)
    const model = fitBikeModel(calibrationStatsAt(others, massKg)).model
    return digest.climbSections.map((section) => ({
      activityId: digest.id,
      start: section.start,
      end: section.end,
      measuredW: section.measuredW,
      estimatedW: powerAt(section.terms, massKg, model),
    }))
  })
  const relErr = segments.map((s) => (s.estimatedW - s.measuredW) / s.measuredW)
  return {
    nSegments: segments.length,
    mape: mean(relErr.map(Math.abs)),
    bias: mean(relErr),
    segments,
  }
}

/**
 * Combines per-activity digests into the athlete's analysis. Only the bike model, the body and
 * bike masses and the efficiency priors enter here, so the work per settings change is small.
 */
export function combine(digests: ActivityDigest[], settings: AthleteSettings): AnalysisResult {
  // A digest contains model-dependent derived values. Mixing revisions would combine stale and
  // current assumptions into one result, so only the active model revision is analysable.
  const ordered = digests
    .filter((digest) => digest.modelRevision === MODEL_REVISION)
    .sort(canonicalOrder)
  const massKg = settings.massKg
  const totalMassKg = settings.massKg + settings.bikeMassKg
  const geKg = PRIORS.grossEfficiency.mean * massKg

  const calibrated: Calibrated[] = ordered.flatMap((digest) =>
    digest.calibration === null ? [] : [{ digest, sums: digest.calibration }],
  )
  const totalSums = calibrated.reduce(
    (acc, c) => addCalibrationSums(acc, c.sums),
    emptyCalibrationSums(),
  )
  const fittedBike = fitBikeModel(calibrationStatsAt(totalSums, totalMassKg))
  const bikeModel = fittedBike.model
  const virtualAccuracy =
    calibrated.length > 0 ? leaveOneOutAccuracy(calibrated, totalSums, totalMassKg) : null

  const rideWatts = (point: DigestCurvePoint): number =>
    point.terms === null ? point.value : powerAt(point.terms, totalMassKg, bikeModel)
  const runBest = bestCurve(
    ordered.filter((d) => d.sport === 'run').map((d) => candidates(d, (p) => p.value)),
  )
  const rideBest = bestCurve(
    ordered.filter((d) => d.sport === 'ride').map((d) => candidates(d, rideWatts)),
  )
  const runCurve = plainCurve(runBest)
  const rideCurve = plainCurve(rideBest)
  const rideMetabolicCurve = rideCurve.map((p) => ({ ...p, value: p.value / geKg }))

  // Blocks are kept only when their metabolic power is above twice resting. This filter is applied
  // after conversion, so it means the same thing for runs and rides.
  const blockMetabolic = (digest: ActivityDigest, block: DigestHrBlock): number => {
    if (digest.sport === 'run') return block.value
    const watts = block.terms === null ? block.value : powerAt(block.terms, totalMassKg, bikeModel)
    return watts / geKg
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
  for (const durationS of [180, 300, 600, 1200, 1800, 3600]) {
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

  const activities = ordered.map(summaryOf).sort((a, b) => b.startMs - a.startMs)
  return {
    activities,
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
