import { DISTANCE_BEST_TOLERANCE, DURATIONS_S, MAX_KM_SPLITS, MAX_MILE_SPLITS } from '../constants'
import type {
  ActivityDigest,
  CalibrationSums,
  PowerSource,
  DigestClimbSection,
  DigestCurvePoint,
  DigestDistanceBest,
  DigestHrBlock,
  DigestSplit,
  DigestSplits,
  PowerTerms,
  QualityFlag,
  QualityKind,
  Sport,
} from '../types'
import { DIGEST_VERSION } from './digestActivity'
import { asDistributions, asDrift, asDurability } from './serializeEvidence'
import {
  asArray,
  asBoolean,
  asFinite,
  asFiniteOrNull,
  asInteger,
  asNonNegativeInteger,
  asNumberOrNaN,
  asObject,
  asOneOf,
  asPositive,
  asString,
  checkRange,
  fail,
} from './parseValue'

/** Writes a digest as JSON. Non-finite numbers become null and are restored by parseDigest. */
export function serializeDigest(digest: ActivityDigest): string {
  return JSON.stringify(digest, (_key, value: unknown) =>
    typeof value === 'number' && !Number.isFinite(value) ? null : value,
  )
}

function asTerms(value: unknown, path: string): PowerTerms {
  const o = asObject(value, path)
  return {
    gravityAccel: asFinite(o.gravityAccel, `${path}.gravityAccel`),
    rolling: asFinite(o.rolling, `${path}.rolling`),
    aero: asFinite(o.aero, `${path}.aero`),
  }
}

function asTermsOrNull(value: unknown, path: string): PowerTerms | null {
  return value === null ? null : asTerms(value, path)
}

function asCalibration(value: unknown, path: string): CalibrationSums | null {
  if (value === null) return null
  const o = asObject(value, path)
  const field = (key: keyof CalibrationSums) => asFinite(o[key], `${path}.${key}`)
  return {
    blocks: field('blocks'),
    rr: field('rr'),
    ra: field('ra'),
    aa: field('aa'),
    rP: field('rP'),
    rG: field('rG'),
    aP: field('aP'),
    aG: field('aG'),
  }
}

/** Every quality kind. The record type makes this list exhaustive over QualityKind. */
const QUALITY_KIND_SET: Record<QualityKind, true> = {
  'hr-dropout': true,
  'hr-spike': true,
  'hr-implausible-for-power': true,
  'power-spike': true,
  'power-dropout': true,
  'speed-spike': true,
  'implausible-speed': true,
  'altitude-jump': true,
  'implausible-climb': true,
  'stream-disagreement': true,
  'missing-altitude': true,
}
const QUALITY_KINDS = Object.keys(QUALITY_KIND_SET) as QualityKind[]

function asFlag(value: unknown, path: string, durationS: number): QualityFlag {
  const o = asObject(value, path)
  const start = asInteger(o.start, `${path}.start`)
  const end = asInteger(o.end, `${path}.end`)
  checkRange(start, end, durationS, path)
  return {
    kind: asOneOf(o.kind, QUALITY_KINDS, `${path}.kind`),
    start,
    end,
    message: asString(o.message, `${path}.message`),
  }
}

function asFlagCounts(value: unknown, path: string): Partial<Record<QualityKind, number>> {
  const o = asObject(value, path)
  const counts: Partial<Record<QualityKind, number>> = {}
  for (const [key, count] of Object.entries(o)) {
    const kind = QUALITY_KINDS.find((k) => k === key)
    if (kind === undefined) fail(`${path}.${key}`, 'is not a quality kind')
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      fail(`${path}.${key}`, 'must be a non-negative integer')
    }
    counts[kind] = count
  }
  return counts
}

function asCurvePoint(value: unknown, index: number, path: string): DigestCurvePoint {
  const o = asObject(value, path)
  const durationS = asInteger(o.durationS, `${path}.durationS`)
  if (durationS !== DURATIONS_S[index]) {
    fail(`${path}.durationS`, `must be ${DURATIONS_S[index]}, got ${durationS}`)
  }
  const windowS = asInteger(o.windowS, `${path}.windowS`)
  if (windowS < durationS) fail(`${path}.windowS`, 'must be at least durationS')
  return {
    durationS,
    value: asNumberOrNaN(o.value, `${path}.value`),
    startIndex: asInteger(o.startIndex, `${path}.startIndex`),
    windowS,
    heartRate: asFiniteOrNull(o.heartRate, `${path}.heartRate`),
    terms: asTermsOrNull(o.terms, `${path}.terms`),
  }
}

function asHrBlock(value: unknown, path: string): DigestHrBlock {
  const o = asObject(value, path)
  return {
    heartRate: asFinite(o.heartRate, `${path}.heartRate`),
    value: asNumberOrNaN(o.value, `${path}.value`),
    terms: asTermsOrNull(o.terms, `${path}.terms`),
  }
}

function asClimbSection(value: unknown, path: string, durationS: number): DigestClimbSection {
  const o = asObject(value, path)
  const start = asInteger(o.start, `${path}.start`)
  const end = asInteger(o.end, `${path}.end`)
  checkRange(start, end, durationS, path)
  return {
    start,
    end,
    measuredW: asPositive(o.measuredW, `${path}.measuredW`),
    terms: asTerms(o.terms, `${path}.terms`),
  }
}

/** Distance bests are optional, so a digest from before the field is read without one. */
function asDistanceBests(value: unknown, durationS: number): DigestDistanceBest[] {
  const bests = asArray(value, 'distanceBests').map((b, i) => {
    const path = `distanceBests[${i}]`
    const o = asObject(b, path)
    const seconds = asPositive(o.seconds, `${path}.seconds`)
    // A time scaled up to its distance may pass the activity by the distance tolerance.
    if (seconds > durationS * (1 + DISTANCE_BEST_TOLERANCE)) {
      fail(`${path}.seconds`, 'must not exceed durationS')
    }
    return { distanceM: asPositive(o.distanceM, `${path}.distanceM`), seconds }
  })
  if (bests.some((b, i) => i > 0 && b.distanceM <= bests[i - 1]!.distanceM)) {
    fail('distanceBests', 'must be in ascending distance')
  }
  return bests
}

/** A finite number that is not negative, or null where a split value is unknown. */
function asSplitValue(value: unknown, path: string): number | null {
  const n = asFiniteOrNull(value, path)
  if (n !== null && n < 0) fail(path, 'must not be negative')
  return n
}

function asSplit(value: unknown, path: string): DigestSplit {
  const o = asObject(value, path)
  const distanceM = asFinite(o.distanceM, `${path}.distanceM`)
  if (distanceM < 0) fail(`${path}.distanceM`, 'must not be negative')
  return {
    distanceM,
    seconds: asSplitValue(o.seconds, `${path}.seconds`),
    gradeAdjustedSeconds: asSplitValue(o.gradeAdjustedSeconds, `${path}.gradeAdjustedSeconds`),
    elevationGainM: asSplitValue(o.elevationGainM, `${path}.elevationGainM`),
    avgHeartRate: asSplitValue(o.avgHeartRate, `${path}.avgHeartRate`),
  }
}

function asSplitList(value: unknown, path: string, limit: number): DigestSplit[] {
  const list = asArray(value, path)
  if (list.length > limit) fail(path, `must have at most ${limit} entries`)
  return list.map((s, i) => asSplit(s, `${path}[${i}]`))
}

function asSplits(value: unknown, path: string): DigestSplits {
  const o = asObject(value, path)
  return {
    km: asSplitList(o.km, `${path}.km`, MAX_KM_SPLITS),
    mile: asSplitList(o.mile, `${path}.mile`, MAX_MILE_SPLITS),
  }
}

const SPORTS: readonly Sport[] = ['run', 'ride']
const POWER_SOURCES: readonly PowerSource[] = ['measured', 'virtual', 'none']

/**
 * Reads a digest written by serializeDigest. Throws an Error naming the offending field when the
 * JSON is not a version 1 digest.
 */
export function parseDigest(json: string): ActivityDigest {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`parseDigest: not JSON (${reason})`, { cause: error })
  }
  const o = asObject(parsed, 'digest')
  if (o.version !== DIGEST_VERSION) {
    fail('version', `must be ${DIGEST_VERSION}, got ${JSON.stringify(o.version)}`)
  }
  const modelRevision =
    o.modelRevision === undefined ? 1 : asInteger(o.modelRevision, 'modelRevision')
  if (modelRevision < 1 || !Number.isSafeInteger(modelRevision)) {
    fail('modelRevision', `must be a positive safe integer, got ${modelRevision}`)
  }
  const curve = asArray(o.curve, 'curve')
  if (curve.length !== DURATIONS_S.length) {
    fail('curve', `must have ${DURATIONS_S.length} points, got ${curve.length}`)
  }
  const durationS = asNonNegativeInteger(o.durationS, 'durationS')
  const distanceM = asNumberOrNaN(o.distanceM, 'distanceM')
  if (distanceM < 0) fail('distanceM', 'must not be negative')
  const distanceBests =
    o.distanceBests === undefined ? undefined : asDistanceBests(o.distanceBests, durationS)
  const sport = asOneOf(o.sport, SPORTS, 'sport')
  const powerSource = asOneOf(o.powerSource, POWER_SOURCES, 'powerSource')
  const hasHeartRate = asBoolean(o.hasHeartRate, 'hasHeartRate')
  const evidence = { sport, durationS, hasHeartRate, measuredPower: powerSource === 'measured' }
  return {
    version: DIGEST_VERSION,
    modelRevision,
    id: asString(o.id, 'id'),
    name: asString(o.name, 'name'),
    sport,
    startMs: asFinite(o.startMs, 'startMs'),
    durationS,
    distanceM,
    elevationGainM: asFinite(o.elevationGainM, 'elevationGainM'),
    hasHeartRate,
    indoor: asBoolean(o.indoor, 'indoor'),
    powerSource,
    flags: asArray(o.flags, 'flags').map((f, i) => asFlag(f, `flags[${i}]`, durationS)),
    flagCounts: asFlagCounts(o.flagCounts, 'flagCounts'),
    maxHeartRate: asFiniteOrNull(o.maxHeartRate, 'maxHeartRate'),
    curve: curve.map((p, i) => asCurvePoint(p, i, `curve[${i}]`)),
    hrBlocks: asArray(o.hrBlocks, 'hrBlocks').map((b, i) => asHrBlock(b, `hrBlocks[${i}]`)),
    calibration: asCalibration(o.calibration, 'calibration'),
    climbSections: asArray(o.climbSections, 'climbSections').map((s, i) =>
      asClimbSection(s, `climbSections[${i}]`, durationS),
    ),
    ...(distanceBests === undefined ? {} : { distanceBests }),
    ...(o.splits === undefined ? {} : { splits: asSplits(o.splits, 'splits') }),
    ...(o.movingS === undefined ? {} : { movingS: asNonNegativeInteger(o.movingS, 'movingS') }),
    ...(o.avgHeartRate === undefined
      ? {}
      : { avgHeartRate: asFiniteOrNull(o.avgHeartRate, 'avgHeartRate') }),
    ...(o.avgPowerW === undefined ? {} : { avgPowerW: asFiniteOrNull(o.avgPowerW, 'avgPowerW') }),
    ...(o.sessionKey === undefined ? {} : { sessionKey: asString(o.sessionKey, 'sessionKey') }),
    ...(o.distributions === undefined
      ? {}
      : { distributions: asDistributions(o.distributions, evidence) }),
    ...(o.durability === undefined ? {} : { durability: asDurability(o.durability, evidence) }),
    ...(o.drift === undefined ? {} : { drift: asDrift(o.drift, evidence) }),
  }
}
