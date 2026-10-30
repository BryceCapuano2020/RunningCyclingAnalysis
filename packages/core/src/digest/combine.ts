import { compareSports, weightedQuantiles } from '../compare'
import { calibrationWeights, drawPriors } from '../compare/sampling'
import { EQUIVALENCE_DURATIONS_S, FLAT_RUN_COST, RESTING_W_PER_KG } from '../constants'
import { criticalPowerOutcome, unevenFit, wPrimeFloor } from '../cp'
import type { UnevenFit } from '../cp'
import { checkEfforts } from '../effort'
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
  VirtualPowerAccuracy,
} from '../types'
import { plainCurve } from './bestCurve'
import { calibratedOf } from './calibration'
import { summaryOf, type ActivitySummary } from './summary'
import type { BikeModelSource } from '../virtualPower'
import { leaveOneOutAccuracy } from './accuracy'
import { massesOf } from './masses'
import { orderedCurrent } from './ordered'
import { judgedCurves } from './judgedCurves'
import { powerCheckOf, trustedPower } from './powerCheck'
import { fitBikeModelOver, measuredRideBest, runCentralWkg } from './rideCurves'
import type { EstimatedRideGate } from './estimatedRide'
import { heartRateCrossCheck } from './heartRateCrossCheck'
import { withoutSetAside } from './trustedHeartRate'
import { vo2maxFromHeartRate, type Vo2maxEstimate } from '../predict/vo2max'
import type { HeartRateJudgement } from './setAsideTypes'

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

/**
 * The activities of a library as summaries, newest first, as the analysis lists them. With dated body
 * masses each summary also carries the mass in effect on its date, which prices its W/kg.
 */
export function activitySummaries(
  digests: ActivityDigest[],
  settings?: AthleteSettings,
): ActivitySummary[] {
  const masses = settings === undefined ? null : massesOf(settings)
  const dated = masses !== null && masses.dated
  return orderedCurrent(digests)
    .map((digest) => {
      const summary = summaryOf(digest, dated ? masses.bodyKg(digest) : undefined)
      const check = masses === null ? undefined : powerCheckOf(digest, masses)
      // A flagged ride gets its own copy; the cached summary is shared and stays as it is.
      return check === undefined ? summary : Object.assign({}, summary, { powerCheck: check })
    })
    .sort((a, b) => b.startMs - a.startMs)
}

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
  references?: Pick<HeartRateJudgement, 'referenceHr' | 'observedMaxHr'>
  /**
   * The library's estimated-ride gate (`HeartRateJudgement.rideGate`): which rides without a power meter count
   * toward the bests, as the athlete's measured rides' heart rate says. Given, every period reads rides by the
   * same rule. Absent, it is built from these digests; null counts every estimated point.
   */
  rideGate?: EstimatedRideGate | null
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
  const ordered = orderedCurrent(digests)
  // The mass of today, which the threshold floors and the comparison are expressed at. Each activity
  // is priced at the body and bike mass in effect on its own date.
  const massKg = settings.massKg
  const masses = massesOf(settings)

  const calibrated = calibratedOf(trustedPower(ordered, masses))
  const fittedBike = fitBikeModelOver(ordered, masses)
  const bikeModel = fittedBike.model
  const virtualAccuracy =
    calibrated.length > 0
      ? leaveOneOutAccuracy(calibrated, (digest) => masses.totalKg(digest))
      : null

  const { curves, fits, heart } = judgedCurves(ordered, masses, bikeModel, massKg, {
    heartRateSetAside: opts.heartRateSetAside,
    rideGate: opts.rideGate,
  })
  const { runBest, rideBest, rideMetabolic, rideComparable, bodyKgById } = curves
  const runCurve = plainCurve(runBest)
  const rideCurve = plainCurve(rideBest)
  const rideMeasuredCurve = plainCurve(measuredRideBest(trustedPower(ordered, masses)))
  const rideMetabolicCurve = rideMetabolic

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
  const hr = heartRateCrossCheck(heart.trusted, masses, bikeModel, { run: runFit, ride: rideFit })
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
  const effort = checkEfforts(
    withoutSetAside(runBest, heart.setAside),
    withoutSetAside(rideBest, heart.setAside),
    reference,
    comparison.prior.map((p) => p.durationS),
  )

  return {
    activities: activitySummaries(digests, settings),
    runCurve,
    rideCurve,
    rideMetabolicCurve,
    rideMeasuredCurve,
    runCp,
    rideCp,
    runCpRefusal: runOutcome.refusal,
    rideCpRefusal: rideOutcome.refusal,
    runCpUneven,
    rideCpUneven,
    hr,
    comparison,
    equivalents,
    maxHeartRate: heart.maxHr,
    runMaxHeartRate: reference.run,
    rideMaxHeartRate: reference.ride,
    runObservedMaxHeartRate: observedMax.run,
    rideObservedMaxHeartRate: observedMax.ride,
    heartRateSetAside: [...heart.setAside].sort(),
    runVo2max: vo2maxFromHeartRate(heart.trusted, reference.run, runCentralWkg),
    effort,
    bikeModel,
    bikeModelSource: fittedBike.source,
    virtualAccuracy,
  }
}
