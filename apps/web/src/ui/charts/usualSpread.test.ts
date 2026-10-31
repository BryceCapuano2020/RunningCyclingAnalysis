import { describe, expect, it } from 'vitest'
import { SPREAD_CUT, SPREAD_WORDS, usualSpread } from './usualSpread'

describe('usualSpread', () => {
  it('cuts the same share from each end, and says its percentiles in words', () => {
    const readings = Array.from({ length: 100 }, (_, i) => i)
    expect(SPREAD_CUT).toBe(0.1)
    expect(usualSpread(readings)).toEqual({ low: 10, high: 89 })
    expect(SPREAD_WORDS).toBe('10th to 90th percentile')
  })

  it('has no spread without readings, and holds a single reading', () => {
    expect(usualSpread([])).toBeNull()
    expect(usualSpread([7])).toEqual({ low: 7, high: 7 })
  })
})
