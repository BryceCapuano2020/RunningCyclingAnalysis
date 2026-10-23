import { DEFAULT_BIKE_MODEL, DURATIONS_S, PRIORS } from '../constants'
import { meanMaximal, monotoneEnvelope } from '../curves'
import type { HeartRateSource } from '../effort'
import { maxHeartRate, windowHeartRate } from '../effort'
import { averageBlocks } from '../hr'
import { mean } from '../math'
import { MIN_RUN_SPEED_MS, runMetabolicPower, smoothGrade } from '../metabolic'
import { assessQuality } from '../quality'
import type {
  Activity,
  ActivityDigest,
  CurvePoint,
  DigestClimbSection,
  DigestCurvePoint,
  DigestHrBlock,
  QualityFlag,
  QualityKind,
  QualityReport,
} from '../types'
import { MODEL_REVISION } from './modelRevision'
import { climbMask, estimatePower, findSegments, splitSegment } from '../virtualPower'
import { calibrationSums } from './calibration'
import type { SampleTerms } from './terms'
import { SELECTION_MASS_KG, sampleTerms, termsOver } from './terms'

export const DIGEST_VERSION = 1

/** Climbs whose measured mean power is below this are too easy to score meaningfully, W. */
const MIN_MEASURED_W = 50
/** Most flags kept per activity. The true count of each kind is kept in flagCounts. */
const MAX_FLAGS = 50

/** The settings-independent parts of a digest, produced per sport and power source. */
interface Parts {
  powerSource: ActivityDigest['powerSource']
  curve: DigestCurvePoint[]
  hrBlocks: DigestHrBlock[]
  calibration: ActivityDigest['calibration']
  climbSections: DigestClimbSection[]
}

/** A curve point together with the length of the window its value came from. */
type WindowedPoint = CurvePoint & { windowS: number }

function elevationGain(altitude: Float64Array, validGrade: Uint8Array): number {
  let gain = 0
  let anchor = NaN
  for (let i = 0; i < altitude.length; i++) {
    if (validGrade[i] !== 1) {
      anchor = NaN
      continue
    }
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

function countFlags(flags: QualityFlag[]): Partial<Record<QualityKind, number>> {
  const counts: Partial<Record<QualityKind, number>> = {}
  for (const flag of flags) counts[flag.kind] = (counts[flag.kind] ?? 0) + 1
  return counts
}

function and(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length)
  for (let i = 0; i < a.length; i++) out[i] = a[i]! & b[i]!
  return out
}

/**
 * Masks grade-dependent samples whose grade is unknown (NaN). Paused and stationary samples are
 * exempt because runMetabolicPower assigns them resting cost, independent of grade.
 */
function withKnownGrade(
  quality: QualityReport,
  rawGrade: Float64Array,
  paused: Uint8Array,
  speed: Float64Array,
): QualityReport {
  const validGrade = Uint8Array.from(quality.validGrade)
  for (let i = 0; i < validGrade.length; i++) {
    const stationary = Number.isFinite(speed[i]!) && speed[i]! < MIN_RUN_SPEED_MS
    if (Number.isNaN(rawGrade[i]!) && paused[i] !== 1 && !stationary) validGrade[i] = 0
  }
  return { ...quality, validGrade }
}

/**
 * Best window at every duration, then the monotone envelope. A value copied from a longer window
 * keeps that window's startIndex and windowS, so every field describes the same window.
 */
function windowedEnvelope(
  values: Float64Array,
  valid: Uint8Array,
  activityId: string,
): WindowedPoint[] {
  const windows = meanMaximal(values, valid, DURATIONS_S, activityId).map((p) => ({
    ...p,
    windowS: p.durationS,
  }))
  return monotoneEnvelope(windows)
}

function valueCurve(
  values: Float64Array,
  valid: Uint8Array,
  source: HeartRateSource,
): DigestCurvePoint[] {
  return windowedEnvelope(values, valid, source.activity.id).map((w) => ({
    durationS: w.durationS,
    value: w.value,
    startIndex: w.startIndex,
    windowS: w.windowS,
    heartRate: windowHeartRate(source, w.startIndex, w.windowS),
    terms: null,
  }))
}

function valueBlocks(
  values: Float64Array,
  valid: Uint8Array,
  source: HeartRateSource,
): DigestHrBlock[] {
  if (!source.activity.hasHeartRate) return []
  const blocks = averageBlocks([values], source.activity.heartRate, valid, source.validHeartRate)
  return blocks.map((b) => ({ heartRate: b.heartRate, value: b.means[0]!, terms: null }))
}

function runParts(
  activity: Activity,
  quality: QualityReport,
  grade: Float64Array,
  source: HeartRateSource,
): Parts {
  const metabolic = runMetabolicPower(activity.speed, grade, PRIORS.runEconomyScale.mean)
  const valid = and(quality.validMotion, quality.validGrade)
  return {
    powerSource: 'none',
    curve: valueCurve(metabolic, valid, source),
    hrBlocks: valueBlocks(metabolic, valid, source),
    calibration: null,
    climbSections: [],
  }
}

/** Climb sections of a power-meter ride with measured power at least MIN_MEASURED_W. */
function climbSectionsOf(
  activity: Activity,
  quality: QualityReport,
  grade: Float64Array,
  terms: SampleTerms,
): DigestClimbSection[] {
  const { power, speed } = activity
  const scorable = new Uint8Array(activity.n)
  for (let i = 0; i < activity.n; i++) {
    const usable =
      quality.validMotion[i] === 1 &&
      quality.validGrade[i] === 1 &&
      quality.validPower[i] === 1 &&
      Number.isFinite(power[i]!) &&
      Number.isFinite(terms.gravityAccel[i]!)
    scorable[i] = usable ? 1 : 0
  }
  const sections: DigestClimbSection[] = []
  for (const climb of findSegments(and(climbMask(grade, speed), scorable))) {
    for (const { start, end } of splitSegment(climb)) {
      const measuredW = mean(power.subarray(start, end))
      if (measuredW < MIN_MEASURED_W) continue
      sections.push({ start, end, measuredW, terms: termsOver(terms, start, end) })
    }
  }
  return sections
}

function measuredParts(
  activity: Activity,
  quality: QualityReport,
  grade: Float64Array,
  source: HeartRateSource,
): Parts {
  const parts: Parts = {
    powerSource: 'measured',
    curve: valueCurve(activity.power, quality.validPower, source),
    hrBlocks: valueBlocks(activity.power, quality.validPower, source),
    calibration: null,
    climbSections: [],
  }
  // Indoor power is not a gradient being ridden, so it cannot calibrate or score a bike model.
  if (activity.indoor) return parts
  const terms = sampleTerms(activity.speed, grade)
  return {
    ...parts,
    calibration: calibrationSums(
      terms,
      activity.speed,
      activity.power,
      and(quality.validMotion, and(quality.validGrade, quality.validPower)),
    ),
    climbSections: climbSectionsOf(activity, quality, grade, terms),
  }
}

/**
 * Rides without a power meter. Only real outdoor climbs are trusted: wind and drafting dominate
 * elsewhere, and a trainer has no gradient at all. Each duration's best climb window is chosen
 * with the default bike model, and its power terms are kept so the bike model can be applied later.
 */
function virtualParts(
  activity: Activity,
  quality: QualityReport,
  grade: Float64Array,
  source: HeartRateSource,
): Parts {
  const outdoorClimbs = activity.hasAltitude && !activity.indoor
  const valid = outdoorClimbs
    ? and(and(quality.validMotion, quality.validGrade), climbMask(grade, activity.speed))
    : new Uint8Array(activity.n)
  // Windows are picked with the default model at a fixed mass, so the digest is independent of the
  // athlete's settings. Combine then evaluates the stored terms at the real mass and fitted bike.
  const selection = windowedEnvelope(
    estimatePower(activity.speed, grade, SELECTION_MASS_KG, DEFAULT_BIKE_MODEL),
    valid,
    activity.id,
  )
  const terms = sampleTerms(activity.speed, grade)
  // The stored terms are linear, so they omit the clamp at zero that estimatePower applies per
  // sample. See powerAt in terms.ts for the size of that bias.
  const curve: DigestCurvePoint[] = selection.map((w) => ({
    durationS: w.durationS,
    value: NaN,
    startIndex: w.startIndex,
    windowS: w.windowS,
    heartRate: windowHeartRate(source, w.startIndex, w.windowS),
    terms: w.startIndex < 0 ? null : termsOver(terms, w.startIndex, w.startIndex + w.windowS),
  }))
  const hrBlocks: DigestHrBlock[] = activity.hasHeartRate
    ? averageBlocks(
        [terms.gravityAccel, terms.rolling, terms.aero],
        activity.heartRate,
        valid,
        source.validHeartRate,
      ).map((b) => ({
        heartRate: b.heartRate,
        value: NaN,
        terms: { gravityAccel: b.means[0]!, rolling: b.means[1]!, aero: b.means[2]! },
      }))
    : []
  return { powerSource: 'virtual', curve, hrBlocks, calibration: null, climbSections: [] }
}

/**
 * Everything the cross-activity analysis needs from one activity. It depends only on the activity
 * itself, never on the athlete's settings, so it can be computed once at import and combined later.
 */
export function digestActivity(activity: Activity): ActivityDigest {
  // Indoor altitude is barometer drift or a simulated course, not a gradient being ridden.
  const rawGrade = activity.indoor
    ? new Float64Array(activity.n)
    : smoothGrade(activity.altitude, activity.distance)
  const quality = withKnownGrade(assessQuality(activity), rawGrade, activity.paused, activity.speed)
  // Unknown grade becomes zero here. Where it matters it is masked by validGrade; paused and
  // stationary samples have grade-independent resting cost.
  const grade = rawGrade.map((g) => (Number.isNaN(g) ? 0 : g))
  const source: HeartRateSource = { activity, validHeartRate: quality.validHeartRate }

  let parts: Parts
  if (activity.sport === 'run') {
    parts = runParts(activity, quality, grade, source)
  } else if (activity.hasPower) {
    parts = measuredParts(activity, quality, grade, source)
  } else {
    parts = virtualParts(activity, quality, grade, source)
  }

  return {
    version: DIGEST_VERSION,
    modelRevision: MODEL_REVISION,
    id: activity.id,
    name: activity.name,
    sport: activity.sport,
    startMs: activity.startMs,
    durationS: activity.n,
    distanceM: activity.n > 0 ? activity.distance[activity.n - 1]! : 0,
    elevationGainM: elevationGain(activity.altitude, quality.validGrade),
    hasHeartRate: activity.hasHeartRate,
    indoor: activity.indoor,
    powerSource: parts.powerSource,
    flags: quality.flags.slice(0, MAX_FLAGS),
    flagCounts: countFlags(quality.flags),
    maxHeartRate: maxHeartRate([source]),
    curve: parts.curve,
    hrBlocks: parts.hrBlocks,
    calibration: parts.calibration,
    climbSections: parts.climbSections,
  }
}
