import { describe, expect, it } from 'vitest'
import {
  clusterBootstrap,
  clusterBootstrapDiff,
  fitDifference,
  looRobust,
  looRobustDiff,
  madSd,
  median,
  normalCdf,
  signConfidenceFromAgree,
  seedFrom,
  signConfidenceFromZ,
  standardErrorOf,
  twoSidedP,
} from './stats'
import { studentTCdf } from './tDistribution'

const mean = (groups: readonly (readonly number[])[]) =>
  groups.flat().reduce((sum, v) => sum + v, 0) / groups.flat().length

describe('normalCdf', () => {
  // SciPy: scipy.stats.norm.cdf
  it.each([
    [0, 0.5],
    [0.5, 0.6914624612740131],
    [1, 0.8413447460685429],
    [1.96, 0.9750021048517795],
    [2.5, 0.9937903346742238],
    [3, 0.9986501019683699],
    [-1, 0.15865525393145707],
  ])('is %d -> %d', (z, expected) => {
    expect(normalCdf(z)).toBeCloseTo(expected, 12)
  })

  it('reaches the ends beyond eight standard deviations', () => {
    expect(normalCdf(-9)).toBe(0)
    expect(normalCdf(9)).toBe(1)
  })

  it('gives the two-sided p of 1.96 as 0.05, never outside 0 to 1', () => {
    expect(twoSidedP(1.96)).toBeCloseTo(0.04999579, 7)
    expect(twoSidedP(-1.96)).toBeCloseTo(0.04999579, 7)
    expect(twoSidedP(0)).toBe(1)
    expect(twoSidedP(9)).toBe(0)
    expect(twoSidedP(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('studentTCdf', () => {
  // SciPy: scipy.stats.t.cdf(t, df), including non-integer degrees as Welch's test gives.
  it.each([
    [2.2, 5, 0.9604530510484088],
    [1.0, 3.7, 0.8109293001197738],
    [0.5, 10, 0.6860531971285135],
    [-2, 30, 0.027312522481491547],
    [3, 2.5, 0.9637119522254841],
    [0, 4, 0.5],
    [1.2, 1, 0.7788579383763045],
  ])('is t=%d at %d degrees -> %d', (t, df, expected) => {
    expect(studentTCdf(t, df)).toBeCloseTo(expected, 10)
  })

  it('has no value for impossible degrees or no t', () => {
    expect(studentTCdf(1, 0)).toBeNaN()
    expect(studentTCdf(Number.NaN, 5)).toBeNaN()
  })
})

describe('seedFrom', () => {
  it('is the same for the same parts, and differs with any of them', () => {
    expect(seedFrom('a', 1, 2)).toBe(seedFrom('a', 1, 2))
    expect(seedFrom('a', 1, 2)).not.toBe(seedFrom('a', 1, 3))
    expect(seedFrom('a', 1, 2)).not.toBe(seedFrom('b', 1, 2))
    expect(seedFrom('a', 12)).not.toBe(seedFrom('a', 1, 2))
    expect(Number.isInteger(seedFrom('x'))).toBe(true)
    expect(seedFrom('x')).toBeLessThan(2 ** 32)
  })
})

describe('madSd', () => {
  // R: mad(c(2,4,4,4,5,5,7,9)) is 0.7413; mad(c(1,2,3,4,100)) is 1.4826.
  it('is 1.4826 times the median absolute deviation, as R reads it', () => {
    expect(madSd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(0.7413, 10)
    expect(madSd([1, 2, 3, 4, 100])).toBeCloseTo(1.4826, 10)
  })

  it('is NaN without values, and the median of an even count is the mean of the middle two', () => {
    expect(madSd([])).toBeNaN()
    expect(median([1, 2, 3, 10])).toBe(2.5)
  })
})

describe('sign confidence', () => {
  it('is 2 * share - 1 for a bootstrap, from a coin flip to all draws', () => {
    expect(signConfidenceFromAgree(0.5)).toBe(0)
    expect(signConfidenceFromAgree(0.9)).toBeCloseTo(0.8, 12)
    expect(signConfidenceFromAgree(1)).toBe(1)
    expect(signConfidenceFromAgree(0.2)).toBe(0)
    expect(signConfidenceFromAgree(Number.NaN)).toBe(0)
  })

  it('is 2 Phi(|z|) - 1 for a z, the same either side of zero', () => {
    expect(signConfidenceFromZ(0)).toBe(0)
    expect(signConfidenceFromZ(1.2815515655446004)).toBeCloseTo(0.8, 9)
    expect(signConfidenceFromZ(-1.2815515655446004)).toBeCloseTo(0.8, 9)
    expect(signConfidenceFromZ(Number.NaN)).toBe(0)
  })

  it("reads a z on Student's t when given degrees of freedom, which is less sure for few activities", () => {
    // SciPy: 2 * t.cdf(2.2, 5) - 1 = 0.92091, against the normal's 2 * norm.cdf(2.2) - 1 = 0.97219
    expect(signConfidenceFromZ(2.2, 5)).toBeCloseTo(0.9209061020968176, 10)
    expect(signConfidenceFromZ(-2.2, 5)).toBeCloseTo(0.9209061020968176, 10)
    expect(signConfidenceFromZ(2.2)).toBeCloseTo(0.972193105, 8)
    expect(signConfidenceFromZ(2.2, 5)).toBeLessThan(signConfidenceFromZ(2.2, 50))
    expect(signConfidenceFromZ(2.2, 0)).toBe(0)
  })
})

describe('fit to fit', () => {
  // t(0.95, df): SciPy gives 2.3534 at 3 and 1.8125 at 10; the half-width over it is the standard error.
  it('reads a standard error from a 90% interval with the t quantile of its activities', () => {
    const fit = { value: 10, low: 8, high: 12, n: 4 }
    expect(standardErrorOf(fit)).toBeCloseTo(2 / 2.353, 6)
    expect(standardErrorOf({ ...fit, n: 11 })).toBeCloseTo(2 / 1.812, 6)
    expect(standardErrorOf({ ...fit, n: 1 })).toBeNaN()
  })

  it('divides the difference by the two errors added in quadrature', () => {
    const from = { value: 10, low: 9, high: 11, n: 11 }
    const to = { value: 12, low: 11, high: 13, n: 11 }
    const se = 1 / 1.812
    const { delta, z } = fitDifference(from, to)
    expect(delta).toBe(2)
    expect(z).toBeCloseTo(2 / Math.hypot(se, se), 2)
    expect(fitDifference(to, from).z).toBeCloseTo(-z, 12)
  })

  it('gives Welch-Satterthwaite degrees of freedom: those of each when equal, fewer when unequal', () => {
    const equal = fitDifference(
      { value: 10, low: 9, high: 11, n: 11 },
      { value: 12, low: 11, high: 13, n: 11 },
    )
    expect(equal.degrees).toBeCloseTo(20, 8)
    // se1 = 2 / 2.132 (4 activities behind 5), se2 = 1 / 1.812: df = (s1^2 + s2^2)^2 / (s1^4 / 4 + s2^4 / 10) = 6.9165
    const unequal = fitDifference(
      { value: 10, low: 8, high: 12, n: 5 },
      { value: 12, low: 11, high: 13, n: 11 },
    )
    expect(unequal.z).toBeCloseTo(1.8375916, 6)
    expect(unequal.degrees).toBeCloseTo(6.916517, 5)
    // R/SciPy: 2 * t.cdf(1.8376, 6.9165) - 1 = 0.89076, where the normal would say 0.93388
    expect(signConfidenceFromZ(unequal.z, unequal.degrees)).toBeCloseTo(0.8907607899972558, 4)
  })
})

describe('clusterBootstrap', () => {
  // 20 activities with one value each, 1 to 20. The mean is 10.5 and its standard error
  // sqrt((20^2 - 1) / 12) / sqrt(20) = 1.289, so the 95% interval is about 10.5 +- 2.53.
  const groups = Array.from({ length: 20 }, (_, i) => [i + 1])

  it('gives an interval about the mean +- 1.96 standard errors', () => {
    const result = clusterBootstrap(groups, mean, 7)
    expect(result.estimate).toBe(10.5)
    expect(result.low).toBeGreaterThan(10.5 - 2.53 - 0.5)
    expect(result.low).toBeLessThan(10.5 - 2.53 + 0.5)
    expect(result.high).toBeGreaterThan(10.5 + 2.53 - 0.5)
    expect(result.high).toBeLessThan(10.5 + 2.53 + 0.5)
    expect(result.draws).toBe(400)
  })

  it('is the same for the same seed and differs for another', () => {
    expect(clusterBootstrap(groups, mean, 7)).toEqual(clusterBootstrap(groups, mean, 7))
    expect(clusterBootstrap(groups, mean, 8).low).not.toBe(clusterBootstrap(groups, mean, 7).low)
  })

  it('agrees on the side of zero for all draws when the values are far from it, about half when not', () => {
    expect(clusterBootstrap(groups, mean, 1).agree).toBe(1)
    const centred = groups.map(([v]) => [v! - 10.5])
    const spread = clusterBootstrap(centred, (g) => mean(g) + 0.001, 1)
    expect(spread.agree).toBeGreaterThan(0.45)
    expect(spread.agree).toBeLessThan(0.55)
  })

  it('resamples whole activities: a statistic of group sizes varies, one of values inside does not', () => {
    const uneven = [[1, 1, 1, 1], [5], [5], [5]]
    const sizes = clusterBootstrap(uneven, (g) => g.flat().length, 3)
    expect(sizes.low).toBeLessThan(sizes.high)
  })

  it('has no interval with fewer than two activities', () => {
    const result = clusterBootstrap([[3]], mean, 1)
    expect(result.estimate).toBe(3)
    expect(result.low).toBeNaN()
    expect(result.agree).toBe(0)
  })

  it('compares two samples each resampled by itself', () => {
    const a = Array.from({ length: 20 }, (_, i) => [i + 11])
    const result = clusterBootstrapDiff(a, groups, (x, y) => mean(x) - mean(y), 5)
    expect(result.estimate).toBe(10)
    expect(result.agree).toBe(1)
    // Two means each with a standard error of 1.289 give a difference with 1.82.
    expect(result.high - result.low).toBeGreaterThan(2 * 1.96 * 1.82 * 0.85)
    expect(result.high - result.low).toBeLessThan(2 * 1.96 * 1.82 * 1.15)
  })
})

describe('looRobust', () => {
  const positive = (v: number) => v > 0

  it('holds when no one activity carries the sign', () => {
    const groups = [[3], [4], [5], [-1], [6]]
    expect(looRobust(groups, mean, positive)).toBe(true)
  })

  it('fails when one activity carries it', () => {
    expect(looRobust([[100], [-1], [-2], [-3]], mean, positive)).toBe(false)
  })

  it('needs two activities, and handles both sides of a difference', () => {
    expect(looRobust([[1]], mean, positive)).toBe(false)
    const a = [[10], [11], [12]]
    const b = [[1], [2], [3]]
    const diff = (x: readonly (readonly number[])[], y: readonly (readonly number[])[]) =>
      mean(x) - mean(y)
    expect(looRobustDiff(a, b, diff, positive)).toBe(true)
    expect(looRobustDiff([[50], [1], [1]], [[3], [3], [3]], diff, positive)).toBe(false)
    expect(looRobustDiff([[50], [1], [1]], [[3], [3], [-30]], diff, (v) => v < 0)).toBe(false)
    expect(looRobustDiff([[1]], b, diff, positive)).toBe(false)
  })
})
