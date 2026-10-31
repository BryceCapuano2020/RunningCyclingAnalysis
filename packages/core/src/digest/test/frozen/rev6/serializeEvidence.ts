import {
  DISTRIBUTION_BINS,
  DURABILITY_AFTER_S,
  DURABILITY_DURATIONS_S,
  MEASURES_OF_SPORT,
} from './constants'
import type { DistributionMeasure } from './constants'
import type {
  DigestDistribution,
  DigestDistributions,
  DigestDrift,
  DigestDurabilityPoint,
} from './types'
import type { Sport } from './types'
import {
  asArray,
  asBetween,
  asInteger,
  asIntegerBetween,
  asObject,
  failRange,
  whenOutOfRange,
} from './parseValue'
import { MAX_ACTIVITY_S, MAX_DIGEST_OUTPUT, MAX_DRIFT_RATIO } from './readLimits'

/** The facts about the digest that the evidence has to agree with. */
export interface EvidenceContext {
  sport: Sport
  durationS: number
  hasHeartRate: boolean
  measuredPower: boolean
  /** Whether the reader leaves out evidence it cannot take, rather than refusing the digest. */
  tolerant: boolean
}

/** Whether a sport's durability comes only from a power meter. */
const NEEDS_MEASURED_POWER: Record<Sport, boolean> = { run: false, ride: true }

const MEASURES = Object.keys(DISTRIBUTION_BINS) as DistributionMeasure[]

function measureOf(key: string): DistributionMeasure | undefined {
  return MEASURES.find((measure) => measure === key)
}

function asDistribution(
  value: unknown,
  measure: DistributionMeasure,
  context: EvidenceContext,
  path: string,
): DigestDistribution {
  const o = asObject(value, path)
  const maxBin = DISTRIBUTION_BINS[measure].maxBin
  const offset = asIntegerBetween(o.offset, `${path}.offset`, 0, maxBin)
  const raw = asArray(o.counts, `${path}.counts`)
  if (raw.length > maxBin + 1)
    failRange(`${path}.counts`, `must have at most ${maxBin + 1} entries`)
  const counts = raw.map((c, i) => asIntegerBetween(c, `${path}.counts[${i}]`, 0, MAX_ACTIVITY_S))
  if (counts.length === 0) failRange(`${path}.counts`, 'must not be empty')
  if (offset + counts.length - 1 > maxBin) failRange(path, `must not reach past bin ${maxBin}`)
  if (counts.reduce((a, b) => a + b, 0) > context.durationS) {
    failRange(`${path}.counts`, 'must not add up to more than durationS')
  }
  return { offset, counts }
}

/** Whether a sport's digest can hold a measure: heart rate needs a heart-rate stream, power a power meter. */
function holds(measure: DistributionMeasure, context: EvidenceContext): boolean {
  if (!MEASURES_OF_SPORT[context.sport].includes(measure)) return false
  if (measure === 'heartRate') return context.hasHeartRate
  return measure !== 'power' || context.measuredPower
}

/** A finite number above zero, up to max. */
function positive(value: unknown, path: string, max: number): number {
  const n = asBetween(value, path, 0, max)
  if (!(n > 0)) failRange(path, 'must be positive')
  return n
}

function asOneOfNumbers(value: unknown, options: readonly number[], path: string): number {
  const found = options.find((option) => option === value)
  if (found === undefined) failRange(path, `must be one of ${options.join(', ')}`)
  return found
}

/**
 * Evidence is read for what the athlete's zones, durability and drift views draw. A tolerant reader
 * (see DigestRules) leaves out a measure, a point or a drift it cannot take, and keeps the activity.
 */
export function asDistributions(value: unknown, context: EvidenceContext): DigestDistributions {
  const o = asObject(value, 'distributions')
  const out: DigestDistributions = {}
  for (const [key, entry] of Object.entries(o)) {
    // A measure this reader does not know comes from a newer build; the activity is read without it.
    const measure = measureOf(key)
    if (measure === undefined) continue
    const path = `distributions.${measure}`
    const read = whenOutOfRange<DigestDistribution | null>(context.tolerant, null, () => {
      if (!holds(measure, context)) failRange(path, 'is not a measure this activity has')
      return asDistribution(entry, measure, context, path)
    })
    if (read !== null) out[measure] = read
  }
  return out
}

function ascends(p: DigestDurabilityPoint, before: DigestDurabilityPoint | undefined): boolean {
  return (
    before === undefined ||
    p.afterS > before.afterS ||
    (p.afterS === before.afterS && p.durationS > before.durationS)
  )
}

export function asDurability(value: unknown, context: EvidenceContext): DigestDurabilityPoint[] {
  const most = DURABILITY_AFTER_S.length * DURABILITY_DURATIONS_S.length
  const all = asArray(value, 'durability')
  if (all.length > most && !context.tolerant) {
    failRange('durability', `must have at most ${most} entries`)
  }
  const read = all.slice(0, most).map((p, i) => {
    const path = `durability[${i}]`
    const o = asObject(p, path)
    return whenOutOfRange<DigestDurabilityPoint | null>(context.tolerant, null, () => {
      const afterS = asOneOfNumbers(o.afterS, DURABILITY_AFTER_S, `${path}.afterS`)
      const durationS = asOneOfNumbers(o.durationS, DURABILITY_DURATIONS_S, `${path}.durationS`)
      if (afterS + durationS > context.durationS) failRange(path, 'does not fit in durationS')
      return { afterS, durationS, value: positive(o.value, `${path}.value`, MAX_DIGEST_OUTPUT) }
    })
  })
  const points: DigestDurabilityPoint[] = []
  for (const point of read) {
    if (point === null) continue
    if (!ascends(point, points.at(-1))) {
      if (context.tolerant) continue
      failRange('durability', 'must be in ascending order, once for each pair')
    }
    points.push(point)
  }
  if (points.length > 0 && NEEDS_MEASURED_POWER[context.sport] && !context.measuredPower) {
    if (context.tolerant) return []
    failRange('durability', 'is only kept for runs and rides with measured power')
  }
  return points
}

export function asDrift(value: unknown, context: EvidenceContext): DigestDrift | null {
  if (value === null) return null
  const o = asObject(value, 'drift')
  return whenOutOfRange<DigestDrift | null>(context.tolerant, null, () => {
    if (!context.hasHeartRate) failRange('drift', 'needs a heart-rate stream')
    const durationS = asInteger(o.durationS, 'drift.durationS')
    if (durationS <= 0 || durationS > context.durationS) {
      failRange('drift.durationS', 'must be positive and at most durationS')
    }
    return {
      firstRatio: positive(o.firstRatio, 'drift.firstRatio', MAX_DRIFT_RATIO),
      secondRatio: positive(o.secondRatio, 'drift.secondRatio', MAX_DRIFT_RATIO),
      durationS,
    }
  })
}
