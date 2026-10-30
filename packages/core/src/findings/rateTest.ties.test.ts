import { describe, expect, it } from 'vitest'
import { poissonRateRatio } from './rateTest'

/** n choose k, as a float. */
function choose(n: number, k: number): number {
  let result = 1
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i
  return result
}

describe('poissonRateRatio counts outcomes as likely as the one seen', () => {
  // At equal exposure the outcome that mirrors the one seen (k to total - k) is exactly as likely, but
  // its log probability is summed in another order, so only the rounding tolerance makes the two compare
  // equal. Without it the p drops the mirror and can cross 0.05. The exact answer is the binomial tail.
  it('equals the exact two-sided binomial p for every split of 1 to 60 events', () => {
    for (let total = 1; total <= 60; total++) {
      for (let first = 0; first <= total; first++) {
        const second = total - first
        const fewer = Math.min(first, second)
        let tail = 0
        for (let k = 0; k <= fewer; k++) tail += choose(total, k)
        const expected = first === second ? 1 : Math.min(1, (2 * tail) / 2 ** total)
        expect(poissonRateRatio(first, 1, second, 1).p, `${first} against ${second}`).toBeCloseTo(
          expected,
          9,
        )
      }
    }
  })
})
