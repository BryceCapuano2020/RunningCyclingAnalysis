import { describe, expect, it } from 'vitest'
import { effortCaveat, effortShareLine, hardEffortsOnFile } from './effortCaveat'

describe('effortCaveat', () => {
  it('gives the card wording and a one-line version when the cycling effort was low', () => {
    const caveat = effortCaveat({ durationS: 1200, runHrFraction: 0.95, rideHrFraction: 0.8 })
    expect(caveat?.title).toBe('Your ride number could be higher')
    expect(caveat?.text).toBe(
      'Your best 20 min on the bike reached 80% of your cycling reference heart rate, so it was probably not your hardest.',
    )
    expect(caveat?.short).toBe('Best cycling effort over 20 min may not have been your hardest.')
  })

  it('gives the running wording when the running effort was low', () => {
    const caveat = effortCaveat({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.95 })
    expect(caveat?.title).toBe('Your run number could be higher')
    expect(caveat?.text).toBe(
      'Your best 20 min running reached 70% of your running reference heart rate, so it was probably not your hardest.',
    )
    expect(caveat?.short).toBe('Best running effort over 20 min may not have been your hardest.')
  })

  it('names both sports when both efforts were low', () => {
    const caveat = effortCaveat({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.8 })
    expect(caveat?.title).toBe('Both numbers could be higher')
    expect(caveat?.text).toBe(
      'Your best 20 min reached 70% of your running reference heart rate and 80% of your cycling one, so neither was probably your hardest.',
    )
    expect(caveat?.short).toBe('Best efforts over 20 min may not have been your hardest.')
  })

  it('does not count an effort of exactly 90% as low', () => {
    const caveat = effortCaveat({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.9 })
    expect(caveat?.title).toBe('Your run number could be higher')
  })

  it('still names the cycling effort when the running check is missing', () => {
    const caveat = effortCaveat({ durationS: 1200, runHrFraction: null, rideHrFraction: 0.8 })
    expect(caveat?.title).toBe('Your ride number could be higher')
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

describe('effortShareLine', () => {
  it('says how far a run reached its reference, and that it was probably not the hardest', () => {
    expect(
      effortShareLine('run', { durationS: 1200, runHrFraction: 0.7, rideHrFraction: null }),
    ).toBe(
      'Your best 20 min running reached 70% of your running reference heart rate, so it was probably not your hardest.',
    )
  })

  it('reads the cycling figure for a ride, on the bike', () => {
    expect(
      effortShareLine('ride', { durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.8 }),
    ).toBe(
      'Your best 20 min on the bike reached 80% of your cycling reference heart rate, so it was probably not your hardest.',
    )
  })

  it('says a best effort at 90% or more was hard', () => {
    expect(
      effortShareLine('run', { durationS: 1200, runHrFraction: 0.95, rideHrFraction: null }),
    ).toBe(
      'Your best 20 min running reached 95% of your running reference heart rate, so it was hard.',
    )
  })

  it('says nothing for a sport with no heart rate, or with no check', () => {
    expect(
      effortShareLine('ride', { durationS: 1200, runHrFraction: 0.7, rideHrFraction: null }),
    ).toBeNull()
    expect(effortShareLine('run', null)).toBeNull()
    expect(effortShareLine('run', undefined)).toBeNull()
  })
})

describe('the 90% boundary is judged on the percent shown', () => {
  it('says a share just under 89.5% reads 89% and was probably not the hardest', () => {
    expect(
      effortShareLine('run', { durationS: 1200, runHrFraction: 0.8949, rideHrFraction: null }),
    ).toBe(
      'Your best 20 min running reached 89% of your running reference heart rate, so it was probably not your hardest.',
    )
    expect(
      effortCaveat({ durationS: 1200, runHrFraction: null, rideHrFraction: 0.8949 })?.text,
    ).toBe(
      'Your best 20 min on the bike reached 89% of your cycling reference heart rate, so it was probably not your hardest.',
    )
  })

  it('says a share of 89.5% reads 90% and was hard, in the line and in the card', () => {
    expect(
      effortShareLine('run', { durationS: 1200, runHrFraction: 0.895, rideHrFraction: null }),
    ).toBe(
      'Your best 20 min running reached 90% of your running reference heart rate, so it was hard.',
    )
    expect(effortCaveat({ durationS: 1200, runHrFraction: null, rideHrFraction: 0.895 })).toBeNull()
    expect(hardEffortsOnFile({ durationS: 1200, runHrFraction: 0.895, rideHrFraction: 0.9 })).toBe(
      true,
    )
  })

  it('says exactly 90% was hard', () => {
    expect(
      effortShareLine('ride', { durationS: 1200, runHrFraction: null, rideHrFraction: 0.9 }),
    ).toBe(
      'Your best 20 min on the bike reached 90% of your cycling reference heart rate, so it was hard.',
    )
    expect(effortCaveat({ durationS: 1200, runHrFraction: null, rideHrFraction: 0.9 })).toBeNull()
  })

  it('names only the sport that is under 89.5% when the other reads 90%', () => {
    expect(
      effortCaveat({ durationS: 1200, runHrFraction: 0.895, rideHrFraction: 0.8 })?.title,
    ).toBe('Your ride number could be higher')
  })
})
