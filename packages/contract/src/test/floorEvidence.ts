import '../zodConfig.ts'
import { z } from 'zod'
import { DISTRIBUTION_BINS, DURABILITY_AFTER_S, DURABILITY_DURATIONS_S } from '@rca/core/constants'
import type { DistributionMeasure } from '@rca/core/constants'
import type {
  DigestDistribution,
  DigestDistributions,
  DigestDrift,
  DigestDurabilityPoint,
  Sport,
} from '@rca/core/types'

/**
 * A frozen copy of the digest reader as the rollback floor Worker (3e17b541, built from bd8aaf7a)
 * has it, so a test can ask whether a digest the current code accepts is one the floor can still
 * read back after a rollback. Do not edit it to follow the current rules. When the rollback floor
 * moves (docs/RELEASES.md), replace it with the contract of the new floor.
 */

// ---- the checks of core/src/digest/parseValue.ts that the evidence reader used ----

type Json = Record<string, unknown>

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

function asInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) fail(path, 'must be an integer')
  return value
}

function asFinite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a finite number')
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

function asOneOf<T extends string>(value: unknown, options: readonly T[], path: string): T {
  const found = options.find((option) => option === value)
  if (found === undefined) fail(path, `must be one of ${options.join(', ')}`)
  return found
}

/** core/src/digest/distributions.ts */
const MEASURES_OF_SPORT: Record<Sport, readonly DistributionMeasure[]> = {
  run: ['heartRate', 'speed'],
  ride: ['heartRate', 'power'],
}

// ---- core/src/digest/serializeEvidence.ts ----

/** The facts about the digest that the evidence has to agree with. */
export interface EvidenceContext {
  sport: Sport
  durationS: number
  hasHeartRate: boolean
  measuredPower: boolean
}

/** Whether a sport's durability comes only from a power meter. */
const NEEDS_MEASURED_POWER: Record<Sport, boolean> = { run: false, ride: true }

const MEASURES = Object.keys(DISTRIBUTION_BINS) as DistributionMeasure[]

function asDistribution(
  value: unknown,
  measure: DistributionMeasure,
  context: EvidenceContext,
  path: string,
): DigestDistribution {
  const o = asObject(value, path)
  const offset = asNonNegativeInteger(o.offset, `${path}.offset`)
  const counts = asArray(o.counts, `${path}.counts`).map((c, i) =>
    asNonNegativeInteger(c, `${path}.counts[${i}]`),
  )
  if (counts.length === 0) fail(`${path}.counts`, 'must not be empty')
  if (offset + counts.length - 1 > DISTRIBUTION_BINS[measure].maxBin) {
    fail(path, `must not reach past bin ${DISTRIBUTION_BINS[measure].maxBin}`)
  }
  if (counts.reduce((a, b) => a + b, 0) > context.durationS) {
    fail(`${path}.counts`, 'must not add up to more than durationS')
  }
  return { offset, counts }
}

/** Whether a sport's digest can hold a measure: heart rate needs a heart-rate stream, power a power meter. */
function holds(measure: DistributionMeasure, context: EvidenceContext): boolean {
  if (!MEASURES_OF_SPORT[context.sport].includes(measure)) return false
  if (measure === 'heartRate') return context.hasHeartRate
  return measure !== 'power' || context.measuredPower
}

function asOneOfNumbers(value: unknown, options: readonly number[], path: string): number {
  const found = options.find((option) => option === value)
  if (found === undefined) fail(path, `must be one of ${options.join(', ')}`)
  return found
}

export function asDistributions(value: unknown, context: EvidenceContext): DigestDistributions {
  const o = asObject(value, 'distributions')
  const out: DigestDistributions = {}
  for (const [key, entry] of Object.entries(o)) {
    const measure = asOneOf(key, MEASURES, `distributions.${key}`)
    const path = `distributions.${measure}`
    if (!holds(measure, context)) fail(path, 'is not a measure this activity has')
    out[measure] = asDistribution(entry, measure, context, path)
  }
  return out
}

export function asDurability(value: unknown, context: EvidenceContext): DigestDurabilityPoint[] {
  const points = asArray(value, 'durability').map((p, i) => {
    const path = `durability[${i}]`
    const o = asObject(p, path)
    const afterS = asOneOfNumbers(o.afterS, DURABILITY_AFTER_S, `${path}.afterS`)
    const durationS = asOneOfNumbers(o.durationS, DURABILITY_DURATIONS_S, `${path}.durationS`)
    if (afterS + durationS > context.durationS) fail(path, 'does not fit in durationS')
    return { afterS, durationS, value: asPositive(o.value, `${path}.value`) }
  })
  const ascending = points.every(
    (p, i) =>
      i === 0 ||
      p.afterS > points[i - 1]!.afterS ||
      (p.afterS === points[i - 1]!.afterS && p.durationS > points[i - 1]!.durationS),
  )
  if (!ascending) fail('durability', 'must be in ascending order, once for each pair')
  if (points.length > 0 && NEEDS_MEASURED_POWER[context.sport] && !context.measuredPower) {
    fail('durability', 'is only kept for runs and rides with measured power')
  }
  return points
}

export function asDrift(value: unknown, context: EvidenceContext): DigestDrift | null {
  if (value === null) return null
  const o = asObject(value, 'drift')
  if (!context.hasHeartRate) fail('drift', 'needs a heart-rate stream')
  const durationS = asInteger(o.durationS, 'drift.durationS')
  if (durationS <= 0 || durationS > context.durationS) {
    fail('drift.durationS', 'must be positive and at most durationS')
  }
  return {
    firstRatio: asPositive(o.firstRatio, 'drift.firstRatio'),
    secondRatio: asPositive(o.secondRatio, 'drift.secondRatio'),
    durationS,
  }
}

/** The fields of a digest the evidence is checked against and the evidence itself. */
export interface EvidenceFields {
  sport: Sport
  durationS: number
  hasHeartRate: boolean
  powerSource: 'measured' | 'virtual' | 'none'
  distributions?: unknown
  durability?: unknown
  drift?: unknown
}

/**
 * Why a digest's evidence is not consistent with the rest of the digest, or null when it is. The
 * contract schemas call this after checking the shapes, so the two readers apply the same rules.
 */
export function evidenceProblem(digest: EvidenceFields): string | null {
  if (!Number.isFinite(digest.durationS)) return null
  const context: EvidenceContext = {
    sport: digest.sport,
    durationS: digest.durationS,
    hasHeartRate: digest.hasHeartRate,
    measuredPower: digest.powerSource === 'measured',
  }
  try {
    if (digest.distributions !== undefined) asDistributions(digest.distributions, context)
    if (digest.durability !== undefined) asDurability(digest.durability, context)
    if (digest.drift !== undefined) asDrift(digest.drift, context)
    return null
  } catch (error) {
    return error instanceof Error ? error.message.replace(/^parseDigest: /, '') : String(error)
  }
}

// ---- contract/src/digestEvidence.ts ----

/**
 * The evidence a digest keeps for the zones, durability and drift views. Shapes and bounds are here;
 * whether they agree with the rest of the digest is checked by checkEvidence, with core's own rules.
 */

const distribution = (measure: DistributionMeasure) =>
  z.object({
    offset: z.number().int().min(0).max(DISTRIBUTION_BINS[measure].maxBin),
    counts: z
      .array(z.number().int().min(0))
      .min(1)
      .max(DISTRIBUTION_BINS[measure].maxBin + 1),
  })

const durabilityPoint = z.object({
  afterS: z.number().refine((s) => DURABILITY_AFTER_S.some((a) => a === s)),
  durationS: z.number().refine((s) => DURABILITY_DURATIONS_S.some((d) => d === s)),
  value: z.number().positive(),
})

const drift = z.object({
  firstRatio: z.number().positive(),
  secondRatio: z.number().positive(),
  durationS: z.number().int().positive(),
})

/** Fields added to a digest after the first ones were stored, so older digests lack them. */
export const evidenceFields = {
  distributions: z
    .object({
      heartRate: distribution('heartRate').optional(),
      power: distribution('power').optional(),
      speed: distribution('speed').optional(),
    })
    .optional(),
  durability: z
    .array(durabilityPoint)
    .max(DURABILITY_AFTER_S.length * DURABILITY_DURATIONS_S.length)
    .optional(),
  drift: drift.nullable().optional(),
}

/** Adds an issue for evidence that disagrees with the digest it is in. */
export function checkEvidence(digest: EvidenceFields, ctx: z.RefinementCtx): void {
  const problem = evidenceProblem(digest)
  if (problem !== null) ctx.addIssue({ code: 'custom', message: problem })
}
