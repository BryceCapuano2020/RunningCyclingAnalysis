import { describe, expect, it } from 'vitest'
import type { BalanceGap } from '../ui/balanceGap'
import { makeResult } from '../ui/components/fixtures'
import { hasShareableContent } from './hasShareableContent'

const NO_COMPARISON = { prior: [], calibrated: null }
const GAP: BalanceGap = { centre: 6, low: 4, high: 8, lean: 'run' }

describe('hasShareableContent', () => {
  it('is true once the sports can be compared and a weight is entered', () => {
    expect(hasShareableContent(makeResult(), null, true)).toBe(true)
  })

  it('is true with a grade gap, without an energy comparison', () => {
    expect(hasShareableContent(makeResult({ comparison: NO_COMPARISON }), GAP, true)).toBe(true)
  })

  it('is false while no weight is entered, since the balance waits for it', () => {
    expect(hasShareableContent(makeResult(), GAP, false)).toBe(false)
  })

  it('is false with one sport on file, so a one-sport card is never offered', () => {
    expect(
      hasShareableContent(makeResult({ comparison: NO_COMPARISON, rideCp: null }), null, true),
    ).toBe(false)
    expect(
      hasShareableContent(makeResult({ comparison: NO_COMPARISON, runCp: null }), null, true),
    ).toBe(false)
  })

  it('is false when the ride has no threshold, even with a comparison, so no image asks for more', () => {
    expect(hasShareableContent(makeResult({ rideCp: null }), null, true)).toBe(false)
    expect(hasShareableContent(makeResult({ rideCp: null }), GAP, true)).toBe(false)
  })

  it('is false when the run has no threshold, even with a comparison', () => {
    expect(hasShareableContent(makeResult({ runCp: null }), GAP, true)).toBe(false)
  })

  it('is false when neither a comparison nor a grade gap says how the balance leans', () => {
    expect(hasShareableContent(makeResult({ comparison: NO_COMPARISON }), null, true)).toBe(false)
  })
})
