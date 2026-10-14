import { describe, expect, it } from 'vitest'
import type { Comparison } from '../../core/types'
import { comparisonPoint, interval } from './fixtures'
import { pickHeadline } from './pickHeadline'

describe('pickHeadline', () => {
  it('returns null when there are no comparison points', () => {
    const comparison: Comparison = { prior: [], calibrated: null }
    expect(pickHeadline(comparison)).toBeNull()
  })

  it('uses the 1200 s point when it is present', () => {
    const prior = [
      comparisonPoint({ durationS: 600 }),
      comparisonPoint({ durationS: 1200 }),
      comparisonPoint({ durationS: 1800 }),
    ]
    const pick = pickHeadline({ prior, calibrated: null })
    expect(pick?.point.durationS).toBe(1200)
    expect(pick?.point).toBe(prior[1])
  })

  it('reports uncalibrated when there is no heart-rate comparison', () => {
    const pick = pickHeadline({ prior: [comparisonPoint()], calibrated: null })
    expect(pick?.calibrated).toBe(false)
  })

  it('prefers the calibrated comparison when it is available', () => {
    const prior = [comparisonPoint({ ratio: interval(0.9, 1.0, 1.1) })]
    const calibrated = [comparisonPoint({ ratio: interval(1.05, 1.12, 1.2) })]
    const pick = pickHeadline({ prior, calibrated })
    expect(pick?.calibrated).toBe(true)
    expect(pick?.point).toBe(calibrated[0])
  })

  it('falls back to the duration closest to 1200 s on a log scale', () => {
    // Linear distance would pick 700 s (500 away against 700 away). Log distance picks 1900 s.
    const prior = [comparisonPoint({ durationS: 700 }), comparisonPoint({ durationS: 1900 })]
    expect(pickHeadline({ prior, calibrated: null })?.point.durationS).toBe(1900)
  })

  it('picks the nearest available duration when 1200 s is missing', () => {
    const prior = [
      comparisonPoint({ durationS: 300 }),
      comparisonPoint({ durationS: 900 }),
      comparisonPoint({ durationS: 3600 }),
    ]
    expect(pickHeadline({ prior, calibrated: null })?.point.durationS).toBe(900)
  })
})
