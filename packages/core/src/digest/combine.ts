import { compareSports, weightedQuantiles } from '../compare'
import { calibrationWeights, drawPriors } from '../compare/sampling'
import {
  DURATIONS_S,
  EQUIVALENCE_DURATIONS_S,
  FLAT_RUN_COST,
  HEADLINE_DURATION_S,
  RESTING_W_PER_KG,
} from '../constants'
import { criticalPowerOutcome, unevenFit, wPrimeFloor } from '../cp'
import type { UnevenFit } from '../cp'
import { checkEfforts } from '../effort'
import type { EffortGate } from '../effort'
import { requirePositiveFinite } from '../math'
import type {
  ActivityDigest,
  AthleteSettings,
  BikeModel,
  Comparison,
  CriticalPowerFit,
  CriticalPowerRefusal,
  Curve,
  EffortCheck,
  HrCalibration,
  HrCrossCheck,
  Interval,
  Sport,
  VirtualPowerAccuracy,
} from '../types'
import { plainCurve } from './bestCurve'
import { calibratedOf } from './calibration'
import { gatedThreshold } from './effortGating'
import { effortGatesOf } from './twentyMinute'
import { activitySummaries } from './activitySummaries'
import type { ActivitySummary } from './summary'
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
import { vo2maxFromHeartRate, type Vo2maxEstimate } from '../predict/vo2max'
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

export interface Equivalence {
  durationS: number
  /**
   * Best mechanical power held for durationS, W: the ride's own watts, from the same ride as rideCurve.
   * With dated body masses that ride is the best power-to-weight one.
   */
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
  /**
   * Best mechanical power while riding, W. See the note above on rides without a power meter. With dated
   * body masses each value is the watts of the best power-to-weight ride at that duration, so it comes
   * from the same ride as rideMetabolicCurve.
   */
  rideCurve: Curve
  /** rideCurve expressed as gross metabolic W/kg at the prior-mean efficiency. */
  rideMetabolicCurve: Curve
  /**
   * Best mechanical power while riding, W, from the rides with a power meter alone. Estimated watts are
   * left out, so each value is a measurement, as the duration profile needs.
   */
  rideMeasuredCurve: Curve
  runCp: CriticalPowerFit | null
  rideCp: CriticalPowerFit | null
  /** Why runCp is null, once there are efforts to fit: see CriticalPowerRefusal. */
  runCpRefusal: CriticalPowerRefusal | null
  rideCpRefusal: CriticalPowerRefusal | null
  /**
   * Whether each sport's best 20 minutes was a hard effort, which every threshold, zone, prediction and level
   * built on its bests waits for (the effort gate). A failed gate withholds the fit (`runCpRefusal` is 'effort') and
   * carries the demonstrated best as its floor.
   */
  effortGate: Record<Sport, EffortGate>
  /** The threshold without the uneven bests, which set only a floor on it; null without one. See cp/uneven. */
  runCpUneven: UnevenFit | null
  rideCpUneven: UnevenFit | null
  /** This period's own heart-rate check. The comparison and the equivalents read the library's (`CombineOptions.calibration`). */
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
  /**
   * Ids of the activities whose heart rate is set aside, sorted: a best effort of theirs held at or
   * above threshold shows heart rate a working sensor would not. Their heart rate is left out of the
   * heart-rate check, the effort checks and the reference heart rates.
   */
  heartRateSetAside: string[]
  /** VO2max from heart rate against pace on hard runs, for the race predictions; null without one. */
  runVo2max: Vo2maxEstimate | null
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

  // Heart rate tracks metabolic power linearly only while the effort is aerobic; above critical
  // power it flattens toward maximum. Blocks are selected on power, never on heart rate, because
  // truncating the dependent variable would bias the slopes. The cut uses the fit before refusal, so
  // a threshold refused for display leaves the heart-rate check as it was.
  const runOutcome = criticalPowerOutcome(runCurve, { minWPrime: wPrimeFloor('run', massKg) })
  const rideOutcome = criticalPowerOutcome(rideMetabolicCurve, {
    minWPrime: wPrimeFloor('ride', massKg),
  })
  const runCp = runOutcome.fit
  const rideCp = rideOutcome.fit
  const runCpUneven = unevenFit(runCurve, wPrimeFloor('run', massKg), runCp)
  const rideCpUneven = unevenFit(rideMetabolicCurve, wPrimeFloor('ride', massKg), rideCp)
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
  const equivalence = equivalenceFor(calibration)
  const equivalents: Equivalence[] = []
  for (const durationS of EQUIVALENCE_DURATIONS_S) {
    const point = rideCurve.find((p) => p.durationS === durationS)
    if (point && Number.isFinite(point.value)) {
      // The ride's own watts at the body mass it rode at, which is massKg without dated masses.
      const rideKg = bodyKgById.get(point.activityId ?? '') ?? massKg
      equivalents.push({
        durationS,
        ridePowerW: point.value,
        runSpeed: equivalence(point.value, rideKg),
      })
    }
  }

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
  // The chip and the gate judge the same effort: the one with the highest heart rate among the 20 minute bests.
  const headline = effort.find((e) => e.durationS === HEADLINE_DURATION_S)
  if (headline !== undefined) {
    if (effortGate.run.share !== null) headline.runHrFraction = effortGate.run.share
    if (effortGate.ride.share !== null) headline.rideHrFraction = effortGate.ride.share
  }
  const run = gatedThreshold(effortGate.run, runOutcome, runCpUneven)
  const ride = gatedThreshold(effortGate.ride, rideOutcome, rideCpUneven)

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
