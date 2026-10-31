import { DURATIONS_S } from '../constants'
import type {
  CalibrationSums,
  DigestClimbSection,
  DigestCurvePoint,
  DigestHrBlock,
  PowerTerms,
  QualityFlag,
  QualityKind,
} from '../types'
import {
  asArray,
  asBetween,
  asBetweenOrNull,
  asIntegerBetween,
  asNumberOrNaNBetween,
  asObject,
  asString,
  checkRange,
  fail,
  failRange,
  whenOutOfRange,
} from './parseValue'
import {
  MAX_ACTIVITY_S,
  MAX_CLIMB_SECTIONS,
  MAX_DIGEST_FLAGS,
  MAX_DIGEST_HEART_RATE,
  MAX_DIGEST_OUTPUT,
  MAX_DIGEST_SUM,
  MAX_HR_BLOCKS,
} from './readLimits'
import type { DigestRules } from './readRules'

/**
 * The parts of a digest, read under a set of rules (see DigestRules). A strict reader takes the
 * shape a digest is made in; a lenient one takes a number a row from an older revision could hold;
 * a tolerant one takes a number outside its bounds as that field's unknown value.
 */

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
  'hr-cadence-lock': true,
}
const QUALITY_KINDS = Object.keys(QUALITY_KIND_SET) as QualityKind[]

/**
 * The kinds a reader takes. Every view takes the cadence-lock kind since release R2 moved the rollback floor to
 * W1, which lists a row with one; a reader of an earlier release (test/frozen) refuses it on create, and the
 * Worker before W1 refused it even in a stored row.
 */
function kindsOf(rules: DigestRules): QualityKind[] {
  return QUALITY_KINDS.filter((kind) => kind !== 'hr-cadence-lock' || rules.acceptsCadenceLock)
}

function kindOf(value: string, rules: DigestRules): QualityKind | undefined {
  return kindsOf(rules).find((kind) => kind === value)
}

/**
 * The nearest to `value` within [low, high], for a number that is out of bounds and has no unknown
 * value to stand in for it. A value that is not a finite number gets `low`; `low` NaN gives NaN.
 */
export function clamped(value: unknown, low: number, high: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Number.isNaN(low)) return low
  return Math.min(high, Math.max(low, value))
}

/** A number in bounds, or null on the wire for NaN. A tolerant reader takes one out of bounds as NaN. */
export function nanIn(
  rules: DigestRules,
  value: unknown,
  path: string,
  min: number,
  max: number,
): number {
  return whenOutOfRange(rules.tolerant, Number.NaN, () =>
    asNumberOrNaNBetween(value, path, min, max),
  )
}

/** A number in bounds, or null. A tolerant reader takes one out of bounds as null. */
export function nullIn(
  rules: DigestRules,
  value: unknown,
  path: string,
  min: number,
  max: number,
): number | null {
  return whenOutOfRange<number | null>(rules.tolerant, null, () =>
    asBetweenOrNull(value, path, min, max),
  )
}

/** The list, held to its cap: a tolerant reader cuts it, any other refuses it. */
export function within<T>(list: T[], most: number, path: string, rules: DigestRules): T[] {
  if (list.length <= most) return list
  if (!rules.tolerant) failRange(path, `must have at most ${most} entries`)
  return list.slice(0, most)
}

/** An output, a power term or a power: a number of either sign up to MAX_DIGEST_OUTPUT. */
function output(rules: DigestRules, value: unknown, path: string): number {
  return nanIn(rules, value, path, -MAX_DIGEST_OUTPUT, MAX_DIGEST_OUTPUT)
}

export function readTerms(value: unknown, path: string, rules: DigestRules): PowerTerms {
  const o = asObject(value, path)
  return {
    gravityAccel: output(rules, o.gravityAccel, `${path}.gravityAccel`),
    rolling: output(rules, o.rolling, `${path}.rolling`),
    aero: output(rules, o.aero, `${path}.aero`),
  }
}

export function readTermsOrNull(
  value: unknown,
  path: string,
  rules: DigestRules,
): PowerTerms | null {
  return value === null ? null : readTerms(value, path, rules)
}

export function readCalibration(
  value: unknown,
  path: string,
  rules: DigestRules,
): CalibrationSums | null {
  if (value === null) return null
  const o = asObject(value, path)
  const field = (key: keyof CalibrationSums) =>
    nanIn(rules, o[key], `${path}.${key}`, -MAX_DIGEST_SUM, MAX_DIGEST_SUM)
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

/** A second within the activity: an integer inside it for a new digest, a number up to the longest for a row. */
function second(rules: DigestRules, value: unknown, path: string): number {
  return rules.lenient
    ? asBetween(value, path, 0, MAX_ACTIVITY_S)
    : asIntegerBetween(value, path, 0, MAX_ACTIVITY_S)
}

/** A flag, or null when the reader drops it: a kind it does not know, or a span it cannot place. */
function readFlag(
  value: unknown,
  path: string,
  durationS: number,
  rules: DigestRules,
): QualityFlag | null {
  const o = asObject(value, path)
  const placed = whenOutOfRange(rules.tolerant, null, () => {
    const start = second(rules, o.start, `${path}.start`)
    const end = second(rules, o.end, `${path}.end`)
    if (!rules.lenient) checkRange(start, end, durationS, path)
    return { start, end, message: asString(o.message, `${path}.message`) }
  })
  // A kind is a string. A string this build does not know is another build's; anything else is damage.
  const kind = typeof o.kind === 'string' ? kindOf(o.kind, rules) : undefined
  if (kind === undefined && (typeof o.kind !== 'string' || !rules.tolerant)) {
    fail(`${path}.kind`, `must be one of ${kindsOf(rules).join(', ')}`)
  }
  return kind === undefined || placed === null ? null : { kind, ...placed }
}

export function readFlags(value: unknown, durationS: number, rules: DigestRules): QualityFlag[] {
  const list = within(asArray(value, 'flags'), MAX_DIGEST_FLAGS * rules.arrayFactor, 'flags', rules)
  const flags: QualityFlag[] = []
  list.forEach((entry, i) => {
    const flag = readFlag(entry, `flags[${i}]`, durationS, rules)
    if (flag !== null) flags.push(flag)
  })
  return flags
}

export function readFlagCounts(
  value: unknown,
  rules: DigestRules,
): Partial<Record<QualityKind, number>> {
  const o = asObject(value, 'flagCounts')
  const counts: Partial<Record<QualityKind, number>> = {}
  for (const [key, count] of Object.entries(o)) {
    const path = `flagCounts.${key}`
    const kind = kindOf(key, rules)
    if (kind === undefined) {
      if (rules.tolerant) continue
      fail(path, 'is not a quality kind')
    }
    if (typeof count !== 'number') fail(path, 'must be a non-negative integer')
    // A count that is negative, fractional or past the longest activity is that kind having no count.
    const kept = whenOutOfRange<number | null>(rules.tolerant, null, () => {
      if (!Number.isInteger(count) || count < 0) failRange(path, 'must be a non-negative integer')
      if (count > MAX_ACTIVITY_S) failRange(path, `must be at most ${MAX_ACTIVITY_S}`)
      return count
    })
    if (kept !== null) counts[kind] = kept
  }
  return counts
}

function readCurvePoint(
  value: unknown,
  index: number,
  path: string,
  rules: DigestRules,
): DigestCurvePoint {
  const o = asObject(value, path)
  const durationS = rules.lenient
    ? nanIn(rules, o.durationS, `${path}.durationS`, 0, MAX_ACTIVITY_S)
    : asIntegerBetween(o.durationS, `${path}.durationS`, 0, MAX_ACTIVITY_S)
  if (!rules.lenient && durationS !== DURATIONS_S[index]) {
    fail(`${path}.durationS`, `must be ${DURATIONS_S[index]}, got ${durationS}`)
  }
  // A window below the duration, or past the longest, is clamped to the nearest it could be.
  const windowS = whenOutOfRange(
    rules.tolerant,
    clamped(o.windowS, rules.lenient ? Number.NaN : durationS, MAX_ACTIVITY_S),
    () => {
      if (rules.lenient) {
        return asNumberOrNaNBetween(o.windowS, `${path}.windowS`, 0, MAX_ACTIVITY_S)
      }
      const window = asIntegerBetween(o.windowS, `${path}.windowS`, 0, MAX_ACTIVITY_S)
      if (window < durationS) failRange(`${path}.windowS`, 'must be at least durationS')
      return window
    },
  )
  return {
    durationS,
    value: nanIn(rules, o.value, `${path}.value`, -MAX_DIGEST_OUTPUT, MAX_DIGEST_OUTPUT),
    // -1 is where a point with no window says it was found.
    startIndex: whenOutOfRange(rules.tolerant, -1, () =>
      rules.lenient
        ? asBetween(o.startIndex, `${path}.startIndex`, -1, MAX_ACTIVITY_S)
        : asIntegerBetween(o.startIndex, `${path}.startIndex`, -1, MAX_ACTIVITY_S),
    ),
    windowS,
    heartRate: nullIn(rules, o.heartRate, `${path}.heartRate`, 0, MAX_DIGEST_HEART_RATE),
    terms: readTermsOrNull(o.terms, `${path}.terms`, rules),
  }
}

export function readCurve(value: unknown, rules: DigestRules): DigestCurvePoint[] {
  const curve = asArray(value, 'curve')
  if (rules.lenient) {
    const list = within(curve, DURATIONS_S.length * rules.arrayFactor, 'curve', rules)
    return list.map((p, i) => readCurvePoint(p, i, `curve[${i}]`, rules))
  }
  if (curve.length !== DURATIONS_S.length) {
    fail('curve', `must have ${DURATIONS_S.length} points, got ${curve.length}`)
  }
  return curve.map((p, i) => readCurvePoint(p, i, `curve[${i}]`, rules))
}

function readHrBlock(value: unknown, path: string, rules: DigestRules): DigestHrBlock {
  const o = asObject(value, path)
  return {
    heartRate: nanIn(rules, o.heartRate, `${path}.heartRate`, 0, MAX_DIGEST_HEART_RATE),
    value: nanIn(rules, o.value, `${path}.value`, -MAX_DIGEST_OUTPUT, MAX_DIGEST_OUTPUT),
    terms: readTermsOrNull(o.terms, `${path}.terms`, rules),
  }
}

export function readHrBlocks(
  value: unknown,
  durationS: number,
  rules: DigestRules,
): DigestHrBlock[] {
  const most = rules.lenient
    ? MAX_HR_BLOCKS * rules.arrayFactor
    : Math.min(MAX_HR_BLOCKS, Math.max(0, Math.floor((durationS - 600) / 300)))
  const blocks = within(asArray(value, 'hrBlocks'), most, 'hrBlocks', rules)
  return blocks.map((b, i) => readHrBlock(b, `hrBlocks[${i}]`, rules))
}

/** A strict reader wants a power above zero; a lenient one takes whatever number the row held. */
function measuredWatts(value: unknown, path: string, rules: DigestRules): number {
  if (rules.lenient) return output(rules, value, path)
  const watts = asBetween(value, path, 0, MAX_DIGEST_OUTPUT)
  if (!(watts > 0)) failRange(path, 'must be positive')
  return watts
}

/** A climb section, or null when a tolerant reader cannot place it. */
function readClimbSection(
  value: unknown,
  path: string,
  durationS: number,
  rules: DigestRules,
): DigestClimbSection | null {
  const o = asObject(value, path)
  return whenOutOfRange<DigestClimbSection | null>(rules.tolerant, null, () => {
    const start = second(rules, o.start, `${path}.start`)
    const end = second(rules, o.end, `${path}.end`)
    if (!rules.lenient) checkRange(start, end, durationS, path)
    return {
      start,
      end,
      measuredW: measuredWatts(o.measuredW, `${path}.measuredW`, rules),
      terms: readTerms(o.terms, `${path}.terms`, rules),
    }
  })
}

export function readClimbSections(
  value: unknown,
  durationS: number,
  rules: DigestRules,
): DigestClimbSection[] {
  const most = rules.lenient
    ? MAX_CLIMB_SECTIONS * rules.arrayFactor
    : Math.min(MAX_CLIMB_SECTIONS, durationS)
  const sections = within(asArray(value, 'climbSections'), most, 'climbSections', rules)
  const read = sections.map((s, i) => readClimbSection(s, `climbSections[${i}]`, durationS, rules))
  return read.filter((section) => section !== null)
}
