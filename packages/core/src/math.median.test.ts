import { describe, expect, it } from 'vitest'
import { medianInPlace, mulberry32, quantile, quantileSorted } from './math'

describe('medianInPlace', () => {
  it('equals the sorted quantile for random sets, with ties, sorted runs and every size to 40', () => {
    const rand = mulberry32(11)
    for (let size = 0; size <= 40; size++) {
      for (const shape of ['random', 'ties', 'ascending', 'descending', 'flat'] as const) {
        const values = Float64Array.from({ length: size }, (_, i) =>
          shape === 'random'
            ? 40 + rand() * 160
            : shape === 'ties'
              ? 100 + Math.floor(rand() * 4)
              : shape === 'ascending'
                ? i * 0.7
                : shape === 'descending'
                  ? 100 - i * 0.7
                  : 123.4,
        )
        const expected = quantile(values, 0.5)
        const median = medianInPlace(values.slice())
        expect(
          Object.is(median, expected) || (Number.isNaN(median) && Number.isNaN(expected)),
        ).toBe(true)
      }
    }
  })

  it('equals the quantile on large random sets', () => {
    const rand = mulberry32(12)
    for (const size of [401, 1000, 4096]) {
      const values = Float64Array.from({ length: size }, () => rand() * 250)
      expect(medianInPlace(values.slice())).toBe(quantile(values, 0.5))
    }
  })
})

describe('quantileSorted', () => {
  it('gives the quantile of the same values sorted once', () => {
    const rand = mulberry32(13)
    const values = Float64Array.from({ length: 57 }, () => rand() * 90)
    const sorted = values.slice().sort()
    for (const q of [0, 0.05, 0.5, 0.95, 1]) {
      expect(quantileSorted(sorted, q)).toBe(quantile(values, q))
    }
    expect(quantileSorted(new Float64Array(0), 0.5)).toBeNaN()
  })
})
