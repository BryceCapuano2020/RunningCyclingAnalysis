import { describe, expect, it } from 'vitest'
import { poissonRateRatio } from './rateTest'

describe('poissonRateRatio', () => {
  // R's example for poisson.test: 11 events in 800 person-years against 6 + 8 + 7 in 1083 + 1050 + 878.
  // poisson.test(c(11, 21), c(800, 3011)): p-value = 0.07967, rate ratio 1.971488. SciPy's binomtest gives 0.0796686.
  it('matches R on the exposure example', () => {
    const result = poissonRateRatio(11, 800, 21, 3011)
    expect(result.p).toBeCloseTo(0.0796686330333295, 9)
    expect(result.ratio).toBeCloseTo(1.971488095, 8)
  })

  it('is symmetric in which count is first', () => {
    expect(poissonRateRatio(21, 3011, 11, 800).p).toBeCloseTo(0.0796686330333295, 9)
  })

  it('is 1 for equal rates, and small for a large difference', () => {
    expect(poissonRateRatio(10, 10, 10, 10).p).toBeCloseTo(1, 12)
    expect(poissonRateRatio(30, 8, 5, 24).p).toBeLessThan(0.001)
  })

  it('has an infinite ratio when only the first has events, and still a p', () => {
    // R: poisson.test(c(6, 0), c(10, 10))$p.value = 2 * 0.5^6 = 0.03125
    const result = poissonRateRatio(6, 10, 0, 10)
    expect(result.ratio).toBe(Number.POSITIVE_INFINITY)
    expect(result.p).toBeCloseTo(0.03125, 10)
  })

  it('has no evidence without events or exposure', () => {
    expect(poissonRateRatio(0, 5, 0, 5).p).toBe(1)
    expect(poissonRateRatio(3, 0, 4, 5).p).toBe(1)
    expect(poissonRateRatio(0, 5, 0, 5).ratio).toBeNaN()
    expect(poissonRateRatio(3, 0, 4, 5).ratio).toBeNaN()
  })
})
