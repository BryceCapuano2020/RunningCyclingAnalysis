import { describe, expect, it } from 'vitest'
import type { Comparison } from '@rca/core/types'
import { effortCaveat, headlineBasis } from './headlineText'

function comparison(overrides: Partial<Comparison> = {}): Comparison {
  return { prior: [], calibrated: null, ...overrides }
}

describe('headlineBasis', () => {
  it('says the population range is shown when the heart-rate check was rejected', () => {
    const rejected = comparison({
      calibration: { effectiveSamples: 1, draws: 4000, accepted: false },
    })
    expect(headlineBasis(rejected, false)).toBe(
      'The heart-rate check could not support a reliable adjustment; showing the population-based model range.',
    )
  })

  it('says the range was adjusted when the heart-rate comparison is used', () => {
    const accepted = comparison({
      calibration: { effectiveSamples: 900, draws: 4000, accepted: true },
    })
    expect(headlineBasis(accepted, true)).toBe('Model range adjusted using your heart-rate data.')
  })

  it('says the range uses population assumptions otherwise', () => {
    expect(headlineBasis(comparison(), false)).toBe('Model range based on population assumptions.')
  })
})

describe('effortCaveat', () => {
  it('gives the page wording and a one-line version when the cycling effort was low', () => {
    const caveat = effortCaveat({ durationS: 1200, runHrFraction: 0.95, rideHrFraction: 0.8 })
    expect(caveat?.text).toBe(
      'Your best cycling effort over 20 min reached 80% of the cycling heart-rate reference. Your library may be missing a harder cycling effort.',
    )
    expect(caveat?.short).toBe('Best cycling effort over 20 min may not have been all-out.')
  })

  it('gives the running wording when the running effort was low', () => {
    const caveat = effortCaveat({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.95 })
    expect(caveat?.short).toBe('Best running effort over 20 min may not have been all-out.')
  })

  it('names both sports when both efforts were low', () => {
    const caveat = effortCaveat({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.8 })
    expect(caveat?.short).toBe('Best efforts over 20 min may not have been all-out.')
  })

  it('has no caveat when both efforts reached 90% or when nothing is known', () => {
    expect(effortCaveat({ durationS: 1200, runHrFraction: 0.9, rideHrFraction: 0.95 })).toBeNull()
    expect(effortCaveat({ durationS: 1200, runHrFraction: null, rideHrFraction: null })).toBeNull()
    expect(effortCaveat(null)).toBeNull()
  })
})
