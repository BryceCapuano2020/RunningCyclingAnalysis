import { describe, expect, it } from 'vitest'
import { effortCaveat, effortShare, hardEffortsOnFile } from './effortCaveat'

describe('effortCaveat', () => {
  it('gives the card wording and a one-line version when the cycling effort was low', () => {
    const caveat = effortCaveat({ durationS: 1200, runHrFraction: 0.95, rideHrFraction: 0.8 })
    expect(caveat?.title).toBe('Your best ride did not reach a hard heart rate')
    expect(caveat?.text).toBe(
      'Your best 20 min on the bike reached 80% of your cycling reference heart rate (set from your highest heart rates on file). That is under the 90% that marks a hard effort.',
    )
    expect(caveat?.short).toBe('Best cycling effort over 20 min did not reach a hard heart rate.')
  })

  it('gives the running wording when the running effort was low', () => {
    const caveat = effortCaveat({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.95 })
    expect(caveat?.title).toBe('Your best run did not reach a hard heart rate')
    expect(caveat?.text).toBe(
      'Your best 20 min running reached 70% of your running reference heart rate (set from your highest heart rates on file). That is under the 90% that marks a hard effort.',
    )
    expect(caveat?.short).toBe('Best running effort over 20 min did not reach a hard heart rate.')
  })

  it('names both sports when both efforts were low', () => {
    const caveat = effortCaveat({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.8 })
    expect(caveat?.title).toBe('Neither best effort reached a hard heart rate')
    expect(caveat?.text).toBe(
      'Your best 20 min reached 70% of your running reference heart rate and 80% of your cycling one (both set from your highest heart rates on file). Both are under the 90% that marks a hard effort.',
    )
    expect(caveat?.short).toBe('Best efforts over 20 min did not reach a hard heart rate.')
  })

  it('does not count an effort of exactly 90% as low', () => {
    const caveat = effortCaveat({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.9 })
    expect(caveat?.title).toBe('Your best run did not reach a hard heart rate')
  })

  it('still names the cycling effort when the running check is missing', () => {
    const caveat = effortCaveat({ durationS: 1200, runHrFraction: null, rideHrFraction: 0.8 })
    expect(caveat?.title).toBe('Your best ride did not reach a hard heart rate')
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

/** The line of the share, or null when heart rate does not say. */
function effortShareLine(...args: Parameters<typeof effortShare>): string | null {
  return effortShare(...args)?.line ?? null
}

describe('effortShare line', () => {
  it('says how far a run reached its reference, and what a hard effort would do', () => {
    expect(
      effortShareLine('run', { durationS: 1200, runHrFraction: 0.7, rideHrFraction: null }),
    ).toBe(
      'Your best 20 min running reached 70% of your running reference heart rate (set from your highest heart rates on file). That is under the 90% that marks a hard effort.',
    )
  })

  it('reads the cycling figure for a ride, on the bike', () => {
    expect(
      effortShareLine('ride', { durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.8 }),
    ).toBe(
      'Your best 20 min on the bike reached 80% of your cycling reference heart rate (set from your highest heart rates on file). That is under the 90% that marks a hard effort.',
    )
  })

  it('says a best effort at 90% or more was hard', () => {
    expect(
      effortShareLine('run', { durationS: 1200, runHrFraction: 0.95, rideHrFraction: null }),
    ).toBe(
      'Your best 20 min running reached 95% of your running reference heart rate (set from your highest heart rates on file): close to your highest heart rate.',
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
  it('says a share just under 89.5% reads 89% and was not hard', () => {
    expect(
      effortShareLine('run', { durationS: 1200, runHrFraction: 0.8949, rideHrFraction: null }),
    ).toBe(
      'Your best 20 min running reached 89% of your running reference heart rate (set from your highest heart rates on file). That is under the 90% that marks a hard effort.',
    )
    expect(
      effortCaveat({ durationS: 1200, runHrFraction: null, rideHrFraction: 0.8949 })?.text,
    ).toBe(
      'Your best 20 min on the bike reached 89% of your cycling reference heart rate (set from your highest heart rates on file). That is under the 90% that marks a hard effort.',
    )
  })

  it('says a share of 89.5% reads 90% and was hard, in the line and in the card', () => {
    expect(
      effortShareLine('run', { durationS: 1200, runHrFraction: 0.895, rideHrFraction: null }),
    ).toBe(
      'Your best 20 min running reached 90% of your running reference heart rate (set from your highest heart rates on file): within 10% of your highest heart rate. Heart rate cannot tell a hard 20 min from an all-out one.',
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
      'Your best 20 min on the bike reached 90% of your cycling reference heart rate (set from your highest heart rates on file): within 10% of your highest heart rate. Heart rate cannot tell a hard 20 min from an all-out one.',
    )
    expect(effortCaveat({ durationS: 1200, runHrFraction: null, rideHrFraction: 0.9 })).toBeNull()
  })

  it('names only the sport that is under 89.5% when the other reads 90%', () => {
    expect(
      effortCaveat({ durationS: 1200, runHrFraction: 0.895, rideHrFraction: 0.8 })?.title,
    ).toBe('Your best ride did not reach a hard heart rate')
  })
})

describe('effortShare', () => {
  it('gives the line, whether the effort was hard, and the share as the whole percent the line shows', () => {
    const hard = effortShare('run', { durationS: 1200, runHrFraction: 0.974, rideHrFraction: null })
    expect(hard).toMatchObject({ hard: true, percent: 97 })
    expect(hard?.line).toContain('reached 97% of your running reference heart rate')
    expect(
      effortShare('ride', { durationS: 1200, runHrFraction: null, rideHrFraction: 0.8 }),
    ).toMatchObject({
      hard: false,
      percent: 80,
    })
  })

  it('judges a share that rounds to 90% as hard, on the percent it shows', () => {
    expect(
      effortShare('run', { durationS: 1200, runHrFraction: 0.896, rideHrFraction: null }),
    ).toMatchObject({
      hard: true,
      percent: 90,
    })
  })

  it('is none when heart rate does not say, or there is no check', () => {
    expect(
      effortShare('run', { durationS: 1200, runHrFraction: null, rideHrFraction: 0.9 }),
    ).toBeNull()
    expect(effortShare('run', null)).toBeNull()
  })
})

describe('a reference the other sport set', () => {
  const ride = {
    durationS: 1200,
    runHrFraction: 0.95,
    rideHrFraction: 0.82,
    rideReferenceFrom: 'run' as const,
  }

  it('says the cycling reference is the running max less 6 bpm, on the card and in the sport line', () => {
    expect(effortCaveat(ride)?.text).toBe(
      'Your best 20 min on the bike reached 82% of your cycling reference heart rate (your running max less 6 bpm). That is under the 90% that marks a hard effort.',
    )
    expect(effortShare('ride', ride)?.line).toBe(
      'Your best 20 min on the bike reached 82% of your cycling reference heart rate (your running max less 6 bpm). That is under the 90% that marks a hard effort.',
    )
  })

  it('says the running reference is the cycling max when the ride set it', () => {
    const run = {
      durationS: 1200,
      runHrFraction: 0.8,
      rideHrFraction: 0.95,
      runReferenceFrom: 'ride' as const,
    }
    expect(effortCaveat(run)?.text).toBe(
      'Your best 20 min running reached 80% of your running reference heart rate (your cycling max). That is under the 90% that marks a hard effort.',
    )
  })

  it('names each source when the two references differ, and one when they match', () => {
    const both = effortCaveat({ ...ride, runHrFraction: 0.7 })
    expect(both?.text).toBe(
      "Your best 20 min reached 70% of your running reference heart rate and 82% of your cycling one (running's set from your highest heart rates on file; cycling's your running max less 6 bpm). Both are under the 90% that marks a hard effort.",
    )
    expect(
      effortCaveat({ durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.8 })?.text,
    ).toContain('(both set from your highest heart rates on file)')
  })

  it('keeps the entered max as it is: a borrowed note only for a reference the activities gave', () => {
    const entered = { ...ride, rideReferenceSource: 'entered' as const }
    expect(effortCaveat(entered)?.text).toContain('(the max heart rate you entered)')
  })
})
