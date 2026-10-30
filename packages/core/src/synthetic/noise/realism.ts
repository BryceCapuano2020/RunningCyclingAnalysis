import { mulberry32, quantile } from '../../math'
import type { Sport } from '../../types'
import { deliveredFactor } from './behaviour'
import type { BehaviourNoise } from './types'

/** Hard efforts a half holds: one 12-week period of a regular athlete. */
export const SPLIT_HALF_EFFORTS = 6
const DEFAULT_DRAWS = 4000

/**
 * Median |ln(best of half A / best of half B)| for two halves of equal capability: the noise a
 * change test has to clear. Each effort is one draw of the delivered factor, as the generator draws it.
 */
export function splitHalfMedian(
  b: BehaviourNoise,
  sport: Sport,
  seed = 1,
  draws = DEFAULT_DRAWS,
  efforts = SPLIT_HALF_EFFORTS,
): number {
  const rand = mulberry32(seed)
  const best = () => {
    let top = 0
    for (let k = 0; k < efforts; k++) top = Math.max(top, deliveredFactor(rand, b, sport))
    return top
  }
  const diffs = Array.from({ length: draws }, () => Math.abs(Math.log(best() / best())))
  return quantile(diffs, 0.5)
}

/** Autocorrelation of a series about its mean at `lag` samples. */
export function autocorrelation(xs: ArrayLike<number>, lag: number): number {
  const n = xs.length
  let mean = 0
  for (let i = 0; i < n; i++) mean += xs[i]!
  mean /= n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    den += (xs[i]! - mean) ** 2
    if (i + lag < n) num += (xs[i]! - mean) * (xs[i + lag]! - mean)
  }
  return num / den
}

/** Spread between two quantiles of the finite values. */
export function quantileRange(xs: ArrayLike<number>, lo: number, hi: number): number {
  const finite = Array.from(xs).filter(Number.isFinite)
  return quantile(finite, hi) - quantile(finite, lo)
}

/**
 * Share of variance a pair of fixed-period sines explains (phases free). The periods are far from
 * each other, so each pair is fitted on its own; close to the least-squares answer, not equal to it.
 */
export function sineShare(xs: ArrayLike<number>, periodsS: readonly number[]): number {
  const n = xs.length
  let mean = 0
  for (let i = 0; i < n; i++) mean += xs[i]!
  mean /= n
  let variance = 0
  for (let i = 0; i < n; i++) variance += (xs[i]! - mean) ** 2
  variance /= n
  let explained = 0
  for (const period of periodsS) {
    let s = 0
    let c = 0
    for (let i = 0; i < n; i++) {
      const phase = (2 * Math.PI * i) / period
      s += (xs[i]! - mean) * Math.sin(phase)
      c += (xs[i]! - mean) * Math.cos(phase)
    }
    explained += (2 / (n * n)) * (s * s + c * c)
  }
  return explained / variance
}
