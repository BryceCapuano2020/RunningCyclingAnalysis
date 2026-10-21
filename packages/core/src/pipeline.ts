import { compareSports, weightedQuantile } from './compare'
import { DURATIONS_S, FLAT_RUN_COST, PRIORS, RESTING_W_PER_KG } from './constants'
import { fitCriticalPower } from './cp'
import type { HeartRateSource } from './effort'
import { checkEfforts, maxHeartRate } from './effort'
import { meanMaximal, mergeCurves, monotoneEnvelope } from './curves'
import { blockPoints, crossCheck } from './hr'
import { mulberry32, truncatedNormal } from './math'
import { rideMetabolicPower, runMetabolicPower, smoothGrade } from './metabolic'
import { assessQuality } from './quality'
import type {
  Activity,
  AthleteSettings,
  BikeModel,
  Comparison,
  CriticalPowerFit,
  Curve,
  DerivedStreams,
  EffortCheck,
  HrCrossCheck,
  HrPoint,
  Interval,
  QualityFlag,
  Sport,
  VirtualPowerAccuracy,
} from './types'
import type { CalibrationRide } from './virtualPower'
import { calibrateBikeModel, climbMask, estimatePower, leaveOneOutAccuracy } from './virtualPower'

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

export interface AnalysisResult {
  activities: ActivitySummary[]
  /** Best gross metabolic power while running, W/kg, at the prior-mean economy. */
  runCurve: Curve
  /** Best mechanical power while riding, W. */
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
  /** Whether each compared best effort was close to all-out, one entry per comparison duration. */
  effort: EffortCheck[]
  bikeModel: BikeModel
  /** Leave-one-ride-out accuracy of the virtual power meter; null with no power-meter rides. */
  virtualAccuracy: VirtualPowerAccuracy | null
}

const DRAWS = 4000
const SEED = 1

function elevationGain(altitude: Float64Array): number {
  let gain = 0
  let anchor = NaN
  for (let i = 0; i < altitude.length; i++) {
    const a = altitude[i]!
    if (Number.isNaN(a)) continue
    if (Number.isNaN(anchor)) anchor = a
    // 2 m hysteresis so barometer noise does not accumulate as climbing
    if (a - anchor >= 2) {
      gain += a - anchor
      anchor = a
    } else if (anchor - a >= 2) {
      anchor = a
    }
  }
  return gain
}

function and(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length)
  for (let i = 0; i < a.length; i++) out[i] = a[i]! & b[i]!
  return out
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
  const draws = opts.draws ?? DRAWS
  const rand = mulberry32(opts.seed ?? SEED)
  const ge = PRIORS.grossEfficiency
  const econ = PRIORS.runEconomyScale
  const speeds = new Float64Array(draws)
  const weights = new Float64Array(draws)
  for (let i = 0; i < draws; i++) {
    const g = truncatedNormal(rand, ge.mean, ge.sd, ge.min, ge.max)
    const s = truncatedNormal(rand, econ.mean, econ.sd, econ.min, econ.max)
    const metabolic = ridePowerW / (g * massKg)
    speeds[i] = Math.max(0, (metabolic - RESTING_W_PER_KG) / (s * FLAT_RUN_COST))
    if (hr && hr.kappa !== null && hr.lnKappaSe !== null) {
      const kappaDraw = ge.mean / g / (s / econ.mean)
      const z = (Math.log(hr.kappa) - Math.log(kappaDraw)) / hr.lnKappaSe
      weights[i] = Math.exp(-0.5 * z * z)
    } else {
      weights[i] = 1
    }
  }
  return {
    p05: weightedQuantile(speeds, weights, 0.05),
    p50: weightedQuantile(speeds, weights, 0.5),
    p95: weightedQuantile(speeds, weights, 0.95),
  }
}

export function analyze(activities: Activity[], settings: AthleteSettings): AnalysisResult {
  const totalMassKg = settings.massKg + settings.bikeMassKg
  const prepared = activities.map((activity) => ({
    activity,
    quality: assessQuality(activity),
    // Indoor altitude is barometer drift or a simulated course, not a gradient being ridden.
    grade: activity.indoor
      ? new Float64Array(activity.n)
      : smoothGrade(activity.altitude, activity.distance),
  }))

  const calibrationRides: CalibrationRide[] = prepared
    .filter((p) => p.activity.sport === 'ride' && p.activity.hasPower && !p.activity.indoor)
    .map((p) => ({
      activityId: p.activity.id,
      speed: p.activity.speed,
      grade: p.grade,
      power: p.activity.power,
      valid: p.quality.validMotion,
    }))
  const bikeModel = calibrateBikeModel(calibrationRides, totalMassKg)
  const virtualAccuracy =
    calibrationRides.length > 0 ? leaveOneOutAccuracy(calibrationRides, totalMassKg) : null

  const summaries: ActivitySummary[] = []
  const runCurves: Curve[] = []
  const rideCurves: Curve[] = []
  const runPoints: HrPoint[] = []
  const ridePoints: HrPoint[] = []

  for (const { activity, quality, grade } of prepared) {
    let powerSource: DerivedStreams['powerSource'] = 'none'
    let metabolic: Float64Array
    let valid = quality.validMotion

    if (activity.sport === 'run') {
      metabolic = runMetabolicPower(activity.speed, grade, PRIORS.runEconomyScale.mean)
      runCurves.push(meanMaximal(metabolic, valid, DURATIONS_S, activity.id))
    } else {
      let mechanical: Float64Array
      if (activity.hasPower) {
        powerSource = 'measured'
        mechanical = activity.power
      } else {
        powerSource = 'virtual'
        mechanical = estimatePower(activity.speed, grade, totalMassKg, bikeModel)
        // Without a power meter, only real outdoor climbs are trusted: wind and drafting
        // dominate elsewhere, and a trainer has no gradient at all.
        valid =
          activity.hasAltitude && !activity.indoor
            ? and(valid, climbMask(grade, activity.speed))
            : new Uint8Array(activity.n)
      }
      metabolic = rideMetabolicPower(mechanical, settings.massKg, PRIORS.grossEfficiency.mean)
      rideCurves.push(meanMaximal(mechanical, valid, DURATIONS_S, activity.id))
    }

    if (activity.hasHeartRate) {
      const points = blockPoints(
        metabolic,
        activity.heartRate,
        valid,
        quality.validHeartRate,
        activity.id,
      )
      ;(activity.sport === 'run' ? runPoints : ridePoints).push(...points)
    }

    summaries.push({
      id: activity.id,
      name: activity.name,
      sport: activity.sport,
      startMs: activity.startMs,
      durationS: activity.n,
      distanceM: activity.n > 0 ? activity.distance[activity.n - 1]! : 0,
      elevationGainM: elevationGain(activity.altitude),
      hasHeartRate: activity.hasHeartRate,
      powerSource,
      flags: quality.flags,
    })
  }

  const empty: Curve = DURATIONS_S.map((durationS) => ({
    durationS,
    value: NaN,
    activityId: null,
    startIndex: -1,
  }))
  const runCurve = runCurves.length > 0 ? monotoneEnvelope(mergeCurves(runCurves)) : empty
  const rideCurve = rideCurves.length > 0 ? monotoneEnvelope(mergeCurves(rideCurves)) : empty
  const rideMetabolicCurve = rideCurve.map((p) => ({
    ...p,
    value: p.value / (PRIORS.grossEfficiency.mean * settings.massKg),
  }))

  const sources = new Map<string, HeartRateSource>(
    prepared.map((p) => [
      p.activity.id,
      { activity: p.activity, validHeartRate: p.quality.validHeartRate },
    ]),
  )
  const maxHr = maxHeartRate([...sources.values()])
  // Heart rate tracks metabolic power linearly only while the effort is aerobic; above
  // critical power it flattens toward maximum. Blocks are selected on power, never on
  // heart rate, because truncating the dependent variable would bias the slopes.
  const runCp = fitCriticalPower(runCurve)
  const rideCp = fitCriticalPower(rideMetabolicCurve)
  const below = (cp: CriticalPowerFit | null) => (p: HrPoint) =>
    cp === null || p.metabolicPower <= cp.cp
  const hr = crossCheck(runPoints.filter(below(runCp)), ridePoints.filter(below(rideCp)))
  const comparison = compareSports(runCurve, rideCurve, settings.massKg, hr, {
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
        runSpeed: equivalentRunSpeed(point.value, settings.massKg, hr),
      })
    }
  }

  const effort = checkEfforts(
    runCurve,
    rideCurve,
    sources,
    maxHr,
    comparison.prior.map((p) => p.durationS),
  )

  summaries.sort((a, b) => b.startMs - a.startMs)
  return {
    activities: summaries,
    runCurve,
    rideCurve,
    rideMetabolicCurve,
    runCp,
    rideCp,
    hr,
    comparison,
    equivalents,
    maxHeartRate: maxHr,
    effort,
    bikeModel,
    virtualAccuracy,
  }
}
