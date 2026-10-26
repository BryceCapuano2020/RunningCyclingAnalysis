import { describe, expect, it } from 'vitest'
import type { Comparison } from '@rca/core/types'
import type { BalanceGap } from '../balanceGap'
import { comparisonPoint, interval, makeResult } from './fixtures'
import { energyReading, gapReading } from './balanceScale'
import {
  balanceSentence,
  balanceSummary,
  balanceTitle,
  effortCaveat,
  hardEffortsOnFile,
  headlineBasis,
  headlineText,
  leadSentence,
  rangeText,
  referenceText,
} from './headlineText'

function comparison(overrides: Partial<Comparison> = {}): Comparison {
  return { prior: [], calibrated: null, ...overrides }
}

function gap(overrides: Partial<BalanceGap> = {}): BalanceGap {
  return { centre: 6, low: 2, high: 10, lean: 'run', ...overrides }
}

/** The words the balance copy must never use: a sport is never a limiter or ahead of another. */
const FORBIDDEN = /ahead of|limiter|weak|strength|holding you back/i

describe('leadSentence', () => {
  it('names the leading sport and its lead in points of grade, as the card and the page both state it', () => {
    expect(leadSentence(gapReading(gap({ centre: 6, low: 4, high: 8, lean: 'run' })))).toBe(
      'Running grades 6 points higher than cycling',
    )
    expect(leadSentence(gapReading(gap({ centre: -6, low: -8, high: -4, lean: 'ride' })))).toBe(
      'Cycling grades 6 points higher than running',
    )
  })

  it('names the lead in percent of energy when there is no grade gap', () => {
    expect(leadSentence(energyReading(interval(1.05, 1.12, 1.2)))).toBe(
      'Running 12% higher on the energy scale',
    )
  })

  it('is the balance sentence without its range, so the card and the page agree', () => {
    const reading = gapReading(gap({ centre: 6, low: 4, high: 8, lean: 'run' }))
    expect(balanceSentence(reading)).toBe(`${leadSentence(reading)} (range ${rangeText(reading)})`)
  })
})

describe('headlineText', () => {
  it('states the energy range the Method page quotes, as signed percentages of running over cycling', () => {
    expect(headlineText(comparisonPoint({ ratio: interval(1.05, 1.12, 1.2) })).range).toBe(
      'Running against cycling, 90% model range: +5% to +20%.',
    )
    expect(headlineText(comparisonPoint({ ratio: interval(0.75, 0.8, 0.9) })).range).toBe(
      'Running against cycling, 90% model range: -25% to -10%.',
    )
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

describe('balanceTitle', () => {
  it('titles the balance by its lean, for a grade gap and for the energy ratio alike', () => {
    expect(balanceTitle(gapReading(gap({ centre: 6, lean: 'run' })))).toBe(
      'Your balance leans toward running',
    )
    expect(balanceTitle(gapReading(gap({ centre: -6, low: -10, high: -2, lean: 'ride' })))).toBe(
      'Your balance leans toward cycling',
    )
    expect(balanceTitle(energyReading(interval(0.95, 1, 1.05)))).toBe(
      'Your running and cycling are in balance',
    )
  })
})

describe('balanceSummary', () => {
  it('names the leading sport and its grade gap in points, on the headline duration', () => {
    expect(balanceSummary(gapReading(gap({ centre: 6, lean: 'run' })), 1200)).toBe(
      'Your running grades 6 points higher than your cycling, on your best 20 min in each.',
    )
  })

  it('names cycling as the leader when cycling grades higher', () => {
    expect(
      balanceSummary(gapReading(gap({ centre: -6, low: -10, high: -2, lean: 'ride' })), 1200),
    ).toBe('Your cycling grades 6 points higher than your running, on your best 20 min in each.')
  })

  it('uses the singular for a gap of one point', () => {
    expect(balanceSummary(gapReading(gap({ centre: 1, low: 1, high: 3 })), 1200)).toMatch(
      /grades 1 point higher/,
    )
  })

  it('says the two are in balance, with the best estimate and the range that includes zero', () => {
    expect(
      balanceSummary(gapReading(gap({ centre: 4, low: -2, high: 10, lean: 'even' })), 1200),
    ).toBe(
      'On the age-grade best estimate, running grades 4 points higher, but the range (−2 to +10 points) includes zero, so the two are in balance.',
    )
  })

  it('says the two grade the same when the best estimate is level', () => {
    expect(
      balanceSummary(gapReading(gap({ centre: 0, low: -2, high: 2, lean: 'even' })), 1200),
    ).toBe(
      'On the age-grade best estimate, running and cycling grade the same, and the range (−2 to +2 points) includes zero, so the two are in balance.',
    )
  })

  it('names cycling when its best estimate leads, inside a range that includes zero', () => {
    expect(
      balanceSummary(gapReading(gap({ centre: -4, low: -10, high: 2, lean: 'even' })), 1200),
    ).toBe(
      'On the age-grade best estimate, cycling grades 4 points higher, but the range (−10 to +2 points) includes zero, so the two are in balance.',
    )
  })

  it('states the energy ratio, with the duration, when the balance is only an energy reading', () => {
    expect(balanceSummary(energyReading(interval(1.05, 1.12, 1.2)), 300)).toBe(
      'Over 5 min, your running is about 12% higher than your cycling once both are put on the same energy scale.',
    )
  })

  it.each([
    ['a grade gap', gapReading(gap())],
    ['an even grade gap', gapReading(gap({ centre: 1, low: -2, high: 4, lean: 'even' }))],
    ['a cycling energy lead', energyReading(interval(0.75, 0.8, 0.9))],
    ['an even energy ratio', energyReading(interval(0.95, 1, 1.05))],
  ])('never says ahead of, limiter, weak or strength for %s', (_name, reading) => {
    expect(`${balanceTitle(reading)} ${balanceSummary(reading, 1200)}`).not.toMatch(FORBIDDEN)
  })
})

describe('balanceSentence', () => {
  it('names the leading sport, its gap in points and the range, for a grade gap', () => {
    expect(balanceSentence(gapReading(gap({ centre: 6, low: 2, high: 10, lean: 'run' })))).toBe(
      'Running grades 6 points higher than cycling (range 2 to 10 points)',
    )
  })

  it('names cycling and its range the same way when cycling grades higher', () => {
    expect(balanceSentence(gapReading(gap({ centre: -6, low: -10, high: -2, lean: 'ride' })))).toBe(
      'Cycling grades 6 points higher than running (range 2 to 10 points)',
    )
  })

  it('states the gap and its range in words when the grades are in balance', () => {
    expect(balanceSentence(gapReading(gap({ centre: 4, low: -2, high: 10, lean: 'even' })))).toBe(
      'In balance: best estimate running +4 points against cycling, range −2 to +10 points',
    )
  })

  it('says how far running is higher on the energy scale, with the range', () => {
    expect(balanceSentence(energyReading(interval(1.05, 1.12, 1.2)))).toBe(
      'Running 12% higher on the energy scale (range 5% to 20%)',
    )
  })

  it('says how far cycling is higher on the energy scale, with the range', () => {
    expect(balanceSentence(energyReading(interval(0.75, 0.8, 0.9)))).toBe(
      'Cycling 25% higher on the energy scale (range 11% to 33%)',
    )
  })

  it('says the balance is even within the range when the range spans 1', () => {
    expect(balanceSentence(energyReading(interval(0.95, 1, 1.05)))).toBe(
      "Even within the model's range (running against cycling -5% to +5%)",
    )
  })
})

describe('rangeText', () => {
  it('gives the range as magnitudes in the leading sport, in points', () => {
    expect(rangeText(gapReading(gap({ centre: 6, low: 2, high: 10, lean: 'run' })))).toBe(
      '2 to 10 points',
    )
  })

  it('gives a cycling range as magnitudes too, since its lead is negative', () => {
    expect(rangeText(gapReading(gap({ centre: -6, low: -10, high: -2, lean: 'ride' })))).toBe(
      '2 to 10 points',
    )
  })

  it('signs the range of an even balance, running against cycling', () => {
    expect(rangeText(gapReading(gap({ centre: 4, low: -2, high: 10, lean: 'even' })))).toBe(
      '−2 to +10 points',
    )
  })
})

describe('balanceSentence wording', () => {
  it.each([
    ['a grade gap that leans', gapReading(gap())],
    ['an even grade gap', gapReading(gap({ centre: 4, low: -2, high: 10, lean: 'even' }))],
    ['a level grade gap', gapReading(gap({ centre: 0, low: -2, high: 2, lean: 'even' }))],
    ['a cycling energy lead', energyReading(interval(0.75, 0.8, 0.9))],
    ['an even energy ratio', energyReading(interval(0.95, 1, 1.05))],
  ])('never says ahead of, limiter, weak or strength for %s', (_name, reading) => {
    expect(balanceSentence(reading)).not.toMatch(FORBIDDEN)
  })
})
