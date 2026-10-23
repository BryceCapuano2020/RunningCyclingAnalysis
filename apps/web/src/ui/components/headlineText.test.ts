import { describe, expect, it } from 'vitest'
import type { Comparison } from '@rca/core/types'
import { comparisonPoint, interval, makeResult } from './fixtures'
import {
  balanceSentence,
  effortCaveat,
  hardEffortsOnFile,
  headlineBasis,
  headlineText,
  referenceText,
} from './headlineText'

function comparison(overrides: Partial<Comparison> = {}): Comparison {
  return { prior: [], calibrated: null, ...overrides }
}

describe('headlineText', () => {
  it('titles the balance as leaning toward running when the whole range is above 1', () => {
    const text = headlineText(comparisonPoint({ ratio: interval(1.05, 1.12, 1.2) }))
    expect(text.title).toBe('Your balance leans toward running')
    expect(text.summary).toBe(
      'Over 20 min, your running is about 12% ahead of your cycling once both are put on the same energy scale.',
    )
    expect(text.range).toBe('Running against cycling, 90% model range: +5% to +20%.')
  })

  it('titles the balance as leaning toward cycling when the whole range is below 1', () => {
    const text = headlineText(comparisonPoint({ ratio: interval(0.75, 0.8, 0.9) }))
    expect(text.title).toBe('Your balance leans toward cycling')
    expect(text.summary).toBe(
      'Over 20 min, your cycling is about 25% ahead of your running once both are put on the same energy scale.',
    )
    expect(text.range).toBe('Running against cycling, 90% model range: -25% to -10%.')
  })

  it('says the sports are in balance when the range spans 1', () => {
    const text = headlineText(comparisonPoint({ ratio: interval(0.95, 1, 1.05) }))
    expect(text.title).toBe('Your running and cycling are in balance')
    expect(text.summary).toBe(
      'Over 20 min, the gap between your running and your cycling is smaller than the model can tell apart.',
    )
    expect(text.range).toBe('Running against cycling, 90% model range: -5% to +5%.')
  })

  it('does not call a lead when the range only touches 1', () => {
    expect(headlineText(comparisonPoint({ ratio: interval(1, 1.05, 1.1) })).title).toBe(
      'Your running and cycling are in balance',
    )
  })

  it('names the duration the comparison is for', () => {
    const text = headlineText(comparisonPoint({ durationS: 300, ratio: interval(1.05, 1.12, 1.2) }))
    expect(text.summary).toMatch(/^Over 5 min, /)
  })
})

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

describe('referenceText', () => {
  it('is null when neither sport has a heart-rate maximum', () => {
    expect(referenceText(makeResult())).toBeNull()
  })

  it('labels each sport figure as its own highest sustained heart rate', () => {
    const result = makeResult({
      runMaxHeartRate: 188,
      runObservedMaxHeartRate: 188,
      rideMaxHeartRate: 182,
      rideObservedMaxHeartRate: 182,
    })
    expect(referenceText(result)).toBe(
      'Best efforts are judged against running 188 bpm (your highest sustained heart rate); cycling 182 bpm (your highest sustained heart rate).',
    )
  })

  it('gives a cycling reference taken from running as the running maximum less 6 bpm', () => {
    const result = makeResult({
      runMaxHeartRate: 188,
      runObservedMaxHeartRate: 188,
      rideMaxHeartRate: 182,
      rideObservedMaxHeartRate: null,
    })
    expect(referenceText(result)).toBe(
      'Best efforts are judged against running 188 bpm (your highest sustained heart rate); cycling 182 bpm (6 bpm below your running maximum).',
    )
  })

  it('gives a running reference taken from cycling as the cycling maximum', () => {
    const result = makeResult({
      runMaxHeartRate: 182,
      runObservedMaxHeartRate: null,
      rideMaxHeartRate: 182,
      rideObservedMaxHeartRate: 182,
    })
    expect(referenceText(result)).toBe(
      'Best efforts are judged against running 182 bpm (your cycling maximum); cycling 182 bpm (your highest sustained heart rate).',
    )
  })

  it('labels a running maximum as the cycling one when cycling showed the higher heart rate', () => {
    const result = makeResult({
      runMaxHeartRate: 185,
      runObservedMaxHeartRate: 180,
      rideMaxHeartRate: 185,
      rideObservedMaxHeartRate: 185,
    })
    expect(referenceText(result)).toBe(
      'Best efforts are judged against running 185 bpm (your cycling maximum); cycling 185 bpm (your highest sustained heart rate).',
    )
  })

  it('rounds each reference to whole beats per minute', () => {
    const result = makeResult({
      runMaxHeartRate: 187.6,
      runObservedMaxHeartRate: 187.6,
      rideMaxHeartRate: null,
    })
    expect(referenceText(result)).toBe(
      'Best efforts are judged against running 188 bpm (your highest sustained heart rate).',
    )
  })

  it('names only the sport that has a reference', () => {
    const result = makeResult({
      runMaxHeartRate: null,
      rideMaxHeartRate: 182,
      rideObservedMaxHeartRate: 182,
    })
    expect(referenceText(result)).toBe(
      'Best efforts are judged against cycling 182 bpm (your highest sustained heart rate).',
    )
  })
})

describe('balanceSentence', () => {
  it('says how far running is ahead, with the range', () => {
    expect(balanceSentence(interval(1.05, 1.12, 1.2))).toBe(
      'Running ahead by 12% (range 5% to 20%)',
    )
  })

  it('says how far cycling is ahead, with the range', () => {
    expect(balanceSentence(interval(0.75, 0.8, 0.9))).toBe(
      'Cycling ahead by 25% (range 11% to 33%)',
    )
  })

  it('says the balance is even within the range when the range spans 1', () => {
    expect(balanceSentence(interval(0.95, 1, 1.05))).toBe(
      "Even within the model's range (running against cycling -5% to +5%)",
    )
  })
})
