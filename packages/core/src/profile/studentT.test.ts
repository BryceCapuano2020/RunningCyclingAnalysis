import { describe, expect, it } from 'vitest'
import { studentTQuantile } from './studentT'

describe('studentTQuantile', () => {
  // Values from standard t tables.
  it.each([
    [0.9, 1, 3.0777],
    [0.95, 1, 6.3138],
    [0.975, 1, 12.7062],
    [0.975, 2, 4.3027],
    [0.975, 5, 2.5706],
    [0.975, 10, 2.2281],
    [0.9, 30, 1.3104],
    [0.995, 14, 2.9768],
    [0.995, 1, 63.6567],
    [0.975, 1000, 1.9623],
  ])('is the table value at p %d with %d degrees of freedom', (p, df, expected) => {
    expect(studentTQuantile(p, df)).toBeCloseTo(expected, 3)
  })

  it('is zero at the median', () => {
    expect(studentTQuantile(0.5, 7)).toBeCloseTo(0, 6)
  })

  it('is larger with fewer degrees of freedom, and approaches the normal quantile', () => {
    expect(studentTQuantile(0.95, 3)).toBeGreaterThan(studentTQuantile(0.95, 10))
    expect(studentTQuantile(0.95, 100_000)).toBeCloseTo(1.6449, 3)
  })
})
