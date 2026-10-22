import { DURATIONS_S } from '../constants'
import type {
  ActivityDigest,
  CalibrationSums,
  DerivedStreams,
  DigestClimbSection,
  DigestCurvePoint,
  DigestHrBlock,
  PowerTerms,
  QualityFlag,
  QualityKind,
  Sport,
} from '../types'
import { DIGEST_VERSION } from './digestActivity'

type Json = Record<string, unknown>

/** Writes a digest as JSON. Non-finite numbers become null and are restored by parseDigest. */
export function serializeDigest(digest: ActivityDigest): string {
  return JSON.stringify(digest, (_key, value: unknown) =>
    typeof value === 'number' && !Number.isFinite(value) ? null : value,
  )
}

function fail(path: string, problem: string): never {
  throw new Error(`parseDigest: ${path} ${problem}`)
}

function asObject(value: unknown, path: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'must be an object')
  }
  return value as Json
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'must be an array')
  return value
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path, 'must be a string')
  return value
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'must be a boolean')
  return value
}

function asInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) fail(path, 'must be an integer')
  return value
}

function asFinite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a finite number')
  return value
}

/** A number that may be NaN, which is written as null. */
function asNumberOrNaN(value: unknown, path: string): number {
  if (value === null) return NaN
  if (typeof value !== 'number') fail(path, 'must be a number or null')
  return value
}

function asNonNegativeInteger(value: unknown, path: string): number {
  const n = asInteger(value, path)
  if (n < 0) fail(path, 'must not be negative')
  return n
}

function asPositive(value: unknown, path: string): number {
  const n = asFinite(value, path)
  if (!(n > 0)) fail(path, 'must be positive')
  return n
}

/** Fails unless 0 <= start < end <= durationS. */
function checkRange(start: number, end: number, durationS: number, path: string): void {
  if (!(0 <= start && start < end && end <= durationS)) {
    fail(path, 'must satisfy 0 <= start < end <= durationS')
  }
}

function asFiniteOrNull(value: unknown, path: string): number | null {
  return value === null ? null : asFinite(value, path)
}

function asOneOf<T extends string>(value: unknown, options: readonly T[], path: string): T {
  const found = options.find((option) => option === value)
  if (found === undefined) fail(path, `must be one of ${options.join(', ')}`)
  return found
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
  'altitude-jump': true,
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

const SPORTS: readonly Sport[] = ['run', 'ride']
const POWER_SOURCES: readonly DerivedStreams['powerSource'][] = ['measured', 'virtual', 'none']

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
    throw new Error(`parseDigest: not JSON (${reason})`)
  }
  const o = asObject(parsed, 'digest')
  if (o.version !== DIGEST_VERSION) {
    fail('version', `must be ${DIGEST_VERSION}, got ${JSON.stringify(o.version)}`)
  }
  const curve = asArray(o.curve, 'curve')
  if (curve.length !== DURATIONS_S.length) {
    fail('curve', `must have ${DURATIONS_S.length} points, got ${curve.length}`)
  }
  const durationS = asNonNegativeInteger(o.durationS, 'durationS')
  const distanceM = asNumberOrNaN(o.distanceM, 'distanceM')
  if (distanceM < 0) fail('distanceM', 'must not be negative')
  return {
    version: DIGEST_VERSION,
    id: asString(o.id, 'id'),
    name: asString(o.name, 'name'),
    sport: asOneOf(o.sport, SPORTS, 'sport'),
    startMs: asFinite(o.startMs, 'startMs'),
    durationS,
    distanceM,
    elevationGainM: asFinite(o.elevationGainM, 'elevationGainM'),
    hasHeartRate: asBoolean(o.hasHeartRate, 'hasHeartRate'),
    indoor: asBoolean(o.indoor, 'indoor'),
    powerSource: asOneOf(o.powerSource, POWER_SOURCES, 'powerSource'),
    flags: asArray(o.flags, 'flags').map((f, i) => asFlag(f, `flags[${i}]`, durationS)),
    flagCounts: asFlagCounts(o.flagCounts, 'flagCounts'),
    maxHeartRate: asFiniteOrNull(o.maxHeartRate, 'maxHeartRate'),
    curve: curve.map((p, i) => asCurvePoint(p, i, `curve[${i}]`)),
    hrBlocks: asArray(o.hrBlocks, 'hrBlocks').map((b, i) => asHrBlock(b, `hrBlocks[${i}]`)),
    calibration: asCalibration(o.calibration, 'calibration'),
    climbSections: asArray(o.climbSections, 'climbSections').map((s, i) =>
      asClimbSection(s, `climbSections[${i}]`, durationS),
    ),
  }
}
