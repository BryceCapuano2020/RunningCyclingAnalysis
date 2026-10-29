import { describe, expect, it } from 'vitest'
import { censoredRankTest, rankTest } from './rankTest'
import type { Censored } from './rankTest'

describe('rankTest', () => {
  // SciPy 1.18: mannwhitneyu(a, b, method='asymptotic', use_continuity=True) -> U1 = 17, p = 0.11134688653314039.
  // R: wilcox.test(a, b, exact = FALSE)$p.value is 0.1113469.
  it('matches SciPy and R for samples without ties', () => {
    const result = rankTest([19, 22, 16, 29, 24], [20, 11, 17, 12])
    expect(result.u).toBe(17)
    expect(result.p).toBeCloseTo(0.11134688653314039, 10)
    expect(result.z).toBeGreaterThan(0)
    expect(result.probability).toBeCloseTo(17 / 20, 12)
  })

  // SciPy: mannwhitneyu(a2, b2, use_continuity=True) -> U1 = 15.5, p = 0.005625214779700691.
  it('matches SciPy with ties, which are shared ranks and shrink the variance', () => {
    const a = [1, 2, 2, 3, 3, 3, 4, 5, 5, 6]
    const b = [3, 4, 4, 5, 6, 6, 7, 7, 8, 9, 9]
    const result = rankTest(a, b)
    expect(result.u).toBe(15.5)
    expect(result.p).toBeCloseTo(0.005625214779700691, 10)
    expect(result.z).toBeLessThan(0)
  })

  it('is the mirror image when the samples swap', () => {
    const a = [19, 22, 16, 29, 24]
    const b = [20, 11, 17, 12]
    expect(rankTest(b, a).p).toBeCloseTo(rankTest(a, b).p, 12)
    expect(rankTest(b, a).z).toBeCloseTo(-rankTest(a, b).z, 12)
  })

  it('leaves out values that are not numbers', () => {
    const clean = rankTest([19, 22, 16, 29, 24], [20, 11, 17, 12])
    const dirty = rankTest(
      [19, Number.NaN, 22, 16, 29, 24],
      [20, 11, Number.POSITIVE_INFINITY, 17, 12],
    )
    expect(dirty.u).toBe(clean.u)
    expect(rankTest([Number.NaN], [1, 2]).p).toBe(1)
  })

  it('has no evidence in an empty sample or in equal values', () => {
    expect(rankTest([], [1, 2]).p).toBe(1)
    expect(rankTest([5, 5, 5], [5, 5]).p).toBe(1)
  })

  it('finds a clear shift significant', () => {
    const low = Array.from({ length: 12 }, (_, i) => i)
    const high = low.map((v) => v + 15)
    expect(rankTest(high, low).p).toBeLessThan(0.001)
    expect(rankTest(high, low).probability).toBe(1)
  })
})

/** Marks times with a trailing + as cut off: the 6-MP leukaemia trial of Freireich et al. (1963). */
function times(list: (number | string)[]): Censored[] {
  return list.map((t) => {
    const censored = typeof t === 'string'
    return { value: censored ? Number(t.replace('+', '')) : t, censored }
  })
}

describe('censoredRankTest', () => {
  const sixMp = times([
    6,
    6,
    6,
    '6+',
    7,
    '9+',
    10,
    '10+',
    '11+',
    13,
    16,
    '17+',
    '19+',
    '20+',
    22,
    23,
    '25+',
    '32+',
    '32+',
    '34+',
    '35+',
  ])
  const placebo = times([1, 1, 2, 2, 3, 4, 4, 5, 5, 8, 8, 8, 8, 11, 11, 12, 12, 15, 17, 22, 23])

  // R: survdiff(Surv(t, s) ~ g): 6-MP observed 9, expected 19.25050095; chisq 16.79294099; variance 6.256960574.
  it('matches the log-rank test of R on the 6-MP trial', () => {
    const result = censoredRankTest(sixMp, placebo)
    expect(result.observed).toBe(9)
    expect(result.expected).toBeCloseTo(19.25050095, 7)
    expect(result.z ** 2).toBeCloseTo(16.79294099, 6)
    expect(result.p).toBeCloseTo(4.168809108e-5, 9)
    expect(result.z).toBeGreaterThan(0)
  })

  it('is signed the other way when the samples swap', () => {
    expect(censoredRankTest(placebo, sixMp).z).toBeCloseTo(-censoredRankTest(sixMp, placebo).z, 12)
  })

  it('has no evidence when nothing happened, or when the timing is the same', () => {
    expect(censoredRankTest(times(['5+', '6+']), times(['7+'])).p).toBe(1)
    expect(censoredRankTest(placebo, placebo).p).toBe(1)
  })
})
