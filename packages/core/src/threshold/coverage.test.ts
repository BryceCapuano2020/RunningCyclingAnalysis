import { describe, expect, it } from 'vitest'
import { P90_TO_P95, Z_P90, Z_P95, endAtFiveNinetyFive } from './coverage'

describe('moving a threshold’s 10th and 90th to its 5th and 95th', () => {
  it('scales the distance on the log scale by the ratio of the two z values', () => {
    expect(P90_TO_P95).toBeCloseTo(Z_P95 / Z_P90, 12)
    const sd = 0.05
    expect(endAtFiveNinetyFive(20, 20 * Math.exp(-Z_P90 * sd))).toBeCloseTo(
      20 * Math.exp(-Z_P95 * sd),
      9,
    )
    expect(endAtFiveNinetyFive(20, 20 * Math.exp(Z_P90 * sd))).toBeCloseTo(
      20 * Math.exp(Z_P95 * sd),
      9,
    )
  })

  it('keeps an end at the centre there, and an end on each side on its own side', () => {
    expect(endAtFiveNinetyFive(20, 20)).toBe(20)
    expect(endAtFiveNinetyFive(20, 18)).toBeLessThan(18)
    expect(endAtFiveNinetyFive(20, 23)).toBeGreaterThan(23)
  })
})
