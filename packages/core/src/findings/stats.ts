import { mulberry32, quantile } from '../math'
import { tQuantile } from '../digest/theilSen'
import { FINDINGS } from './constants'
import { studentTCdf } from './tDistribution'

/** The standard normal cumulative distribution (Marsaglia's series, accurate to about 1e-15 away from the far tails). */
export function normalCdf(z: number): number {
  if (z < -8) return 0
  if (z > 8) return 1
  let sum = z
  let term = z
  const square = z * z
  for (let i = 3; i < 300; i += 2) {
    term *= square / i
    const next = sum + term
    if (next === sum) break
    sum = next
  }
  return 0.5 + sum * Math.exp(-0.5 * square - 0.9189385332046728)
}

/** The two-sided p of a standard normal z, from 0 to 1. */
export function twoSidedP(z: number): number {
  return Math.min(1, Math.max(0, 2 * (1 - normalCdf(Math.abs(z)))))
}

/**
 * A seed from the parts it should depend on (a finding's id, the week, a statistic's name), so that
 * no two statistics share a stream and the same data gives the same interval. FNV-1a, 32 bits.
 */
export function seedFrom(...parts: (string | number)[]): number {
  let hash = 0x811c9dc5
  for (const char of parts.join('|')) {
    hash = Math.imul(hash ^ char.codePointAt(0)!, 0x01000193) >>> 0
  }
  return hash
}

export function median(values: ArrayLike<number>): number {
  return quantile(values, 0.5)
}

/** A normal-consistent spread that a few outliers cannot move: 1.4826 times the median absolute deviation. */
export function madSd(values: ArrayLike<number>): number {
  if (values.length === 0) return Number.NaN
  const centre = median(values)
  return 1.4826 * median(Array.from(values, (v) => Math.abs(v - centre)))
}

/** How sure of the sign when `share` of the bootstrap draws fall on the estimate's side: 0 at a coin flip, 1 at all. */
export function signConfidenceFromAgree(share: number): number {
  return Number.isFinite(share) ? Math.min(1, Math.max(0, 2 * share - 1)) : 0
}

/**
 * How sure of the sign at z standard errors from zero: 2 F(|z|) - 1, with F Student's t at `degrees` of
 * freedom when given, which is wider than the normal for the few activities a fit stands on, and the
 * normal when not. A strength of evidence on a scale from 0 to 1, not a probability that the sign is
 * right: how often a detector speaks when nothing changed is what the null harness measures.
 */
export function signConfidenceFromZ(z: number, degrees?: number): number {
  if (!Number.isFinite(z)) return 0
  const cdf = degrees === undefined ? normalCdf(Math.abs(z)) : studentTCdf(Math.abs(z), degrees)
  return Number.isFinite(cdf) ? 2 * cdf - 1 : 0
}

/** An estimate with the ends of its 90% interval and the activities it stands on, as sameHeartRate gives one. */
export interface IntervalEstimate {
  value: number
  low: number
  high: number
  n: number
}

/** The standard error behind a 90% interval from n activities: its half-width over Student's t, n - 1 degrees. */
export function standardErrorOf(estimate: IntervalEstimate): number {
  if (estimate.n < 2) return Number.NaN
  return (estimate.high - estimate.low) / 2 / tQuantile(estimate.n - 1)
}

export interface FitDifference {
  /** to - from. */
  delta: number
  /** delta over the standard error of the difference, the two fits being independent; signed by delta. */
  z: number
  /** Welch-Satterthwaite degrees of freedom of that standard error, to read z on Student's t. */
  degrees: number
}

/**
 * How far apart two fits are, in standard errors: z = delta / sqrt(se1^2 + se2^2), with the degrees of
 * freedom Welch's test gives from the activities behind each, so that a few activities cannot look as
 * certain as many. Pass both to signConfidenceFromZ.
 */
export function fitDifference(from: IntervalEstimate, to: IntervalEstimate): FitDifference {
  const delta = to.value - from.value
  const a = standardErrorOf(from)
  const b = standardErrorOf(to)
  const se = Math.hypot(a, b)
  const degrees = se ** 4 / (a ** 4 / (from.n - 1) + b ** 4 / (to.n - 1))
  return { delta, z: se > 0 ? delta / se : Number.NaN, degrees }
}

export interface BootstrapResult {
  /** The statistic on the data as it is. */
  estimate: number
  /** The 2.5th and 97.5th percentiles of the draws: a 95% interval. */
  low: number
  high: number
  /** The share of draws on the estimate's side of zero; 0.5 for an estimate of zero. */
  agree: number
  /** The draws that gave a number. */
  draws: number
}

function summarise(estimate: number, draws: number[]): BootstrapResult {
  if (!Number.isFinite(estimate) || draws.length === 0) {
    return { estimate, low: Number.NaN, high: Number.NaN, agree: 0, draws: draws.length }
  }
  const side = Math.sign(estimate)
  const agreeing = draws.filter((d) => side === 0 || Math.sign(d) === side).length
  return {
    estimate,
    low: quantile(draws, 0.025),
    high: quantile(draws, 0.975),
    agree: side === 0 ? 0.5 : agreeing / draws.length,
    draws: draws.length,
  }
}

function resampled<T>(groups: readonly T[], random: () => number): T[] {
  return Array.from({ length: groups.length }, () => groups[Math.floor(random() * groups.length)]!)
}

/**
 * A bootstrap that resamples activities, not the values inside them, since one activity's values share
 * its day. `groups` holds one array per activity; `statistic` is read from a resample of them. Seeded, so
 * the same data and seed give the same interval. Draws are FINDINGS.bootstrapDraws. With fewer than two
 * activities there is nothing to resample, and the interval is NaN.
 */
export function clusterBootstrap<T>(
  groups: readonly (readonly T[])[],
  statistic: (resample: readonly (readonly T[])[]) => number,
  seed: number,
): BootstrapResult {
  const estimate = statistic(groups)
  if (groups.length < 2) return summarise(estimate, [])
  const random = mulberry32(seed)
  const draws: number[] = []
  for (let d = 0; d < FINDINGS.bootstrapDraws; d++) {
    const value = statistic(resampled(groups, random))
    if (Number.isFinite(value)) draws.push(value)
  }
  return summarise(estimate, draws)
}

/** The same for a difference between two samples of activities, each resampled by itself. */
export function clusterBootstrapDiff<T>(
  a: readonly (readonly T[])[],
  b: readonly (readonly T[])[],
  statistic: (a: readonly (readonly T[])[], b: readonly (readonly T[])[]) => number,
  seed: number,
): BootstrapResult {
  const estimate = statistic(a, b)
  if (a.length < 2 || b.length < 2) return summarise(estimate, [])
  const random = mulberry32(seed)
  const draws: number[] = []
  for (let d = 0; d < FINDINGS.bootstrapDraws; d++) {
    const value = statistic(resampled(a, random), resampled(b, random))
    if (Number.isFinite(value)) draws.push(value)
  }
  return summarise(estimate, draws)
}

/** Whether `holds` is true of the statistic with each one activity left out in turn. False with fewer than two. */
export function looRobust<T>(
  groups: readonly (readonly T[])[],
  statistic: (rest: readonly (readonly T[])[]) => number,
  holds: (value: number) => boolean,
): boolean {
  if (groups.length < 2) return false
  return groups.every((_, left) => holds(statistic(groups.filter((__, i) => i !== left))))
}

/** The same for a difference of two samples: each activity of either side is left out in turn. */
export function looRobustDiff<T>(
  a: readonly (readonly T[])[],
  b: readonly (readonly T[])[],
  statistic: (a: readonly (readonly T[])[], b: readonly (readonly T[])[]) => number,
  holds: (value: number) => boolean,
): boolean {
  if (a.length < 2 || b.length < 2) return false
  const without = (groups: readonly (readonly T[])[], left: number) =>
    groups.filter((_, i) => i !== left)
  return (
    a.every((_, left) => holds(statistic(without(a, left), b))) &&
    b.every((_, left) => holds(statistic(a, without(b, left))))
  )
}
