import { compareSports, weightedQuantiles } from '../compare'
import { calibrationWeights, drawPriors } from '../compare/sampling'
import { DURATIONS_S, EQUIVALENCE_DURATIONS_S, FLAT_RUN_COST, RESTING_W_PER_KG } from '../constants'
import { checkEfforts } from '../effort'
import { requirePositiveFinite } from '../math'
import type {
  ActivityDigest,
  AthleteSettings,
  HrCalibration,
  HrCrossCheck,
  Interval,
} from '../types'
import { plainCurve } from './bestCurve'
import { calibratedOf } from './calibration'
import { gatedThresholds, thresholdFits } from './combineThresholds'
import { effortGatesOf, judgeHeadline } from './twentyMinute'
import { equivalentsOf } from './equivalents'
import type { Equivalence } from './equivalents'
import { activitySummaries } from './activitySummaries'
import type { BikeModelSource } from '../virtualPower'
import { leaveOneOutAccuracy } from './accuracy'
import { massesOf } from './masses'
import { orderedFor } from './consumers'
import { judgedCurves } from './judgedCurves'
import { trustedPower } from './powerCheck'
import { rideReferenceOf } from './powerEvidence'
import { answers } from './judgedWork'
import type { JudgedWork } from './judgedWork'
import { fitBikeModelOver, measuredRideBest, runCentralWkg } from './rideCurves'
import type { EstimatedRideGate } from './estimatedRide'
import { heartRateCrossCheck } from './heartRateCrossCheck'
import { withoutSetAside } from './trustedHeartRate'
import { vo2maxFromHeartRate } from '../predict/vo2max'
import type { HeartRateJudgement } from './setAsideTypes'

/** A heart-rate check with points and fits of its own, for a result that must not share them with the judgement. */
function copyOfCheck(check: HrCrossCheck): HrCrossCheck {
  const copyOf = (sport: HrCrossCheck['run']) =>
    sport === null
      ? null
      : {
          points: sport.points.map((point) => Object.assign({}, point)),
          fit: Object.assign({}, sport.fit),
        }
  return {
    run: copyOf(check.run),
    ride: copyOf(check.ride),
    kappa: check.kappa,
    lnKappaSe: check.lnKappaSe,
  }
}

import type { AnalysisResult } from './analysisResult'

export type { AnalysisResult }
export type { Equivalence }

export type { BikeModelSource }

const DRAWS = 4000
const SEED = 1

/**
 * The flat running speed that costs the same gross metabolic power as riding at a given power,
 * for one heart-rate model. The efficiency draws and their heart-rate weights depend only on the
 * model, so they are built once here, and each power costs one pass over them.
 */
export function equivalenceFor(
  hr: HrCalibration | null,
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
  hr: HrCalibration | null,
  opts: { draws?: number; seed?: number } = {},
): Interval {
  return equivalenceFor(hr, opts)(ridePowerW, massKg)
}

export { orderedCurrent } from './ordered'
export {
  centralWkgFromWatts,
  heartRatePoints,
  rideWattsAt,
  runCentralWkg,
  sportCurves,
} from './rideCurves'

export interface CombineOptions {
  /**
   * The activities whose heart rate is set aside, judged over the whole library (`judgeHeartRate`). Given,
   * these digests are not judged again, so a period is read by the same judgement as every other period. Absent,
   * the digests are judged among themselves, which is the whole library's judgement when they are it.
   */
  heartRateSetAside?: ReadonlySet<string>
  /**
   * The athlete's heart-rate calibration of the run-versus-ride efficiency, judged over the whole library
   * (`judgeHeartRate`). Given, the comparison and the equivalents read it instead of this period's own
   * check, so one ride is worth the same run pace whichever period is on screen. Absent, they read the check of
   * these digests, which is the library's when they are it. Null reads no calibration.
   */
  calibration?: HrCalibration | null
  /**
   * The reference heart rates of the whole library (`HeartRateJudgement`). Given, this period's efforts are judged
   * against them and the result reports them, so the athlete's reference heart rate is one number whichever
   * period is on screen. Absent, they are taken from these digests alone.
   */
  references?: Pick<HeartRateJudgement, 'referenceHr' | 'observedMaxHr' | 'effortReference'>
  /**
   * The library's estimated-ride gate (`HeartRateJudgement.rideGate`): which rides without a power meter count
   * toward the bests, as the athlete's measured rides' heart rate says. Given, every period reads rides by the
   * same rule. Absent, it is built from these digests; null counts every estimated point.
   */
  rideGate?: EstimatedRideGate | null
  /**
   * What judging the library worked out (`judgedWorkOf`). Used only when these digests are the judged ones under the
   * same masses, gate and set-aside, when the analysis is the same figures without working them out again.
   */
  judged?: JudgedWork
}

/**
 * Combines per-activity digests into the athlete's analysis. Only the bike model, the body and
 * bike masses and the efficiency priors enter here, so the work per settings change is small.
 */
export function combine(
  digests: ActivityDigest[],
  settings: AthleteSettings,
  opts: CombineOptions = {},
): AnalysisResult {
  requirePositiveFinite('massKg', settings.massKg)
  requirePositiveFinite('bikeMassKg', settings.bikeMassKg)
  const ordered = orderedFor('combine', digests)
  // The mass of today, which the threshold floors and the comparison are expressed at. Each activity
  // is priced at the body and bike mass in effect on its own date.
  const massKg = settings.massKg
  const masses = massesOf(settings)

  // The library's judgement already did the work of an analysis of the whole library under the same masses.
  const reused =
    opts.judged !== undefined && answers(opts.judged, ordered, settings, opts) ? opts.judged : null
  const calibrated = calibratedOf(trustedPower(ordered, masses))
  const fittedBike =
    reused === null
      ? fitBikeModelOver(ordered, masses)
      : { model: { ...reused.bikeModel }, source: reused.bikeModelSource }
  const bikeModel = fittedBike.model
  const virtualAccuracy =
    calibrated.length > 0
      ? leaveOneOutAccuracy(calibrated, (digest) => masses.totalKg(digest))
      : null

  const { curves, fits, heart, gate } =
    reused ??
    judgedCurves(
      ordered,
      masses,
      bikeModel,
      massKg,
      { heartRateSetAside: opts.heartRateSetAside, rideGate: opts.rideGate },
      settings,
    )
  const { runBest, rideBest, rideMetabolic, rideComparable, bodyKgById } = curves
  const runCurve = plainCurve(runBest)
  const rideCurve = plainCurve(rideBest)
  const rideMeasuredCurve = plainCurve(measuredRideBest(trustedPower(ordered, masses)))
  // What the judgement worked out is shared, so what the result hands out is a copy.
  const rideMetabolicCurve =
    reused === null ? rideMetabolic : rideMetabolic.map((point) => Object.assign({}, point))

  const runFit = fits.run
  const rideFit = fits.ride

  const thresholds = thresholdFits(runCurve, rideMetabolicCurve, massKg)
  const hr =
    (reused === null ? null : copyOfCheck(reused.cross)) ??
    heartRateCrossCheck(heart.trusted, masses, bikeModel, { run: runFit, ride: rideFit })
  // The calibration is the athlete's, not the period's: given, it replaces this period's own check below.
  const calibration = opts.calibration === undefined ? hr : opts.calibration
  const comparison = compareSports(runCurve, rideComparable, massKg, calibration, {
    draws: DRAWS,
    seed: SEED,
  })

  // The draws and their heart-rate weights are the same for every duration, so they are built once.
  const equivalents = equivalentsOf(
    equivalenceFor(calibration),
    rideCurve,
    bodyKgById,
    massKg,
    EQUIVALENCE_DURATIONS_S,
  )

  const reference = opts.references?.referenceHr ?? heart.reference
  const observedMax = opts.references?.observedMaxHr ?? heart.observedMax
  const judged = opts.references?.effortReference ?? heart.effort
  const heartRuns = withoutSetAside(runBest, heart.setAside)
  const heartRides = withoutSetAside(rideBest, heart.setAside)
  // Every duration, not the comparison's: a library of one sport has no comparison, and still has efforts to judge.
  const effort = checkEfforts(heartRuns, heartRides, judged.referenceHr, DURATIONS_S, judged)
  const effortGate = effortGatesOf(
    ordered,
    masses,
    bikeModel,
    gate,
    { run: runCurve, ride: rideMetabolicCurve },
    judged,
    heart.setAside,
  )
  judgeHeadline(effort, effortGate)
  const { run, ride } = gatedThresholds(
    effortGate,
    thresholds,
    runCurve,
    rideMetabolicCurve,
    massKg,
  )

  return {
    activities: activitySummaries(digests, settings, rideReferenceOf(judged)),
    runCurve,
    rideCurve,
    rideMetabolicCurve,
    rideMeasuredCurve,
    runCp: run.fit,
    rideCp: ride.fit,
    runCpRefusal: run.refusal,
    rideCpRefusal: ride.refusal,
    effortGate,
    runCpUneven: run.uneven,
    rideCpUneven: ride.uneven,
    hr,
    comparison,
    equivalents,
    maxHeartRate: heart.maxHr,
    runMaxHeartRate: reference.run,
    rideMaxHeartRate: reference.ride,
    runObservedMaxHeartRate: observedMax.run,
    rideObservedMaxHeartRate: observedMax.ride,
    heartRateSetAside: [...heart.setAside].sort(),
    // A share of a reference that is not a maximum would price VO2max as if it were one.
    runVo2max:
      judged.reading.run === 'trusted'
        ? vo2maxFromHeartRate(heart.trusted, judged.referenceHr.run, runCentralWkg)
        : null,
    effort,
    bikeModel,
    bikeModelSource: fittedBike.source,
    virtualAccuracy,
  }
}
