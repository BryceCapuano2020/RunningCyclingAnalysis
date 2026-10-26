import { describe, expect, it } from 'vitest'
import { effortCaveat, hardEffortsOnFile } from './effortCaveat'

describe('effortCaveat', () => {
  it('gives the card wording and a one-line version when the cycling effort was low', () => {
    const caveat = effortCaveat({ durationS: 1200, runHrFraction: 0.95, rideHrFraction: 0.8 })
    expect(caveat?.title).toBe('Your ride number may be low')
    expect(caveat?.text).toBe(
      'Your best 20 min on the bike reached 80% of your cycling heart-rate reference, so it was probably not all-out. A recent race or a test of this length would sharpen it.',
    )
    expect(caveat?.short).toBe('Best cycling effort over 20 min may not have been all-out.')
  })

  it('gives the running wording when the running effort was low', () => {
    const caveat = effortCaveat({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.95 })
    expect(caveat?.title).toBe('Your run number may be low')
    expect(caveat?.text).toBe(
      'Your best 20 min running reached 70% of your running heart-rate reference, so it was probably not all-out. A recent race or a test of this length would sharpen it.',
    )
    expect(caveat?.short).toBe('Best running effort over 20 min may not have been all-out.')
  })

  it('names both sports when both efforts were low', () => {
    const caveat = effortCaveat({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.8 })
    expect(caveat?.title).toBe('Both numbers may be low')
    expect(caveat?.text).toBe(
      'Your best 20 min reached 70% of your running heart-rate reference and 80% of your cycling one, so neither was probably all-out. A recent race or a hard effort of this length in each sport would sharpen both.',
    )
    expect(caveat?.short).toBe('Best efforts over 20 min may not have been all-out.')
  })

  it('does not count an effort of exactly 90% as low', () => {
    const caveat = effortCaveat({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.9 })
    expect(caveat?.title).toBe('Your run number may be low')
  })

  it('still names the cycling effort when the running check is missing', () => {
    const caveat = effortCaveat({ durationS: 1200, runHrFraction: null, rideHrFraction: 0.8 })
    expect(caveat?.title).toBe('Your ride number may be low')
  })

  it('has no caveat when both efforts reached 90% or when nothing is known', () => {
    expect(effortCaveat({ durationS: 1200, runHrFraction: 0.9, rideHrFraction: 0.95 })).toBeNull()
    expect(effortCaveat({ durationS: 1200, runHrFraction: null, rideHrFraction: null })).toBeNull()
    expect(effortCaveat(null)).toBeNull()
    expect(effortCaveat(undefined)).toBeNull()
  })
})

describe('hardEffortsOnFile', () => {
  it('is true when both best efforts reached 90% of their heart-rate reference', () => {
    expect(hardEffortsOnFile({ durationS: 1200, runHrFraction: 0.9, rideHrFraction: 0.95 })).toBe(
      true,
    )
  })

  it('is false when either best effort was below 90%', () => {
    expect(hardEffortsOnFile({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.95 })).toBe(
      false,
    )
    expect(hardEffortsOnFile({ durationS: 1200, runHrFraction: 0.95, rideHrFraction: 0.8 })).toBe(
      false,
    )
  })

  it('is false when a sport has no heart-rate check, or there is no check at all', () => {
    expect(hardEffortsOnFile({ durationS: 1200, runHrFraction: 0.95, rideHrFraction: null })).toBe(
      false,
    )
    expect(hardEffortsOnFile(null)).toBe(false)
    expect(hardEffortsOnFile(undefined)).toBe(false)
  })
})
