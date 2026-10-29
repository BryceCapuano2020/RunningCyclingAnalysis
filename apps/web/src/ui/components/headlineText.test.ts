import { describe, expect, it } from 'vitest'
import type { Comparison } from '@rca/core/types'
import type { BalanceGap } from '../balanceGap'
import { comparisonPoint, interval, makeResult } from './fixtures'
import { energyReading, gapReading } from './balanceScale'
import {
  balanceSentence,
  balanceSummary,
  balanceTitle,
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
      'Running 12% higher, as energy per kilogram',
    )
  })

  it('says nothing of a lead within two percent, which the headline calls level', () => {
    expect(leadSentence(energyReading(interval(1.001, 1.003, 1.01)))).toBeNull()
    expect(leadSentence(energyReading(interval(0.9, 0.996, 0.999)))).toBeNull()
  })

  it('is the balance sentence without its range, so the card and the page agree', () => {
    const reading = gapReading(gap({ centre: 6, low: 4, high: 8, lean: 'run' }))
    expect(balanceSentence(reading)).toBe(`${leadSentence(reading)} (range ${rangeText(reading)})`)
  })
})

describe('headlineText', () => {
  it('states the energy range the Method page quotes, named from the leading sport', () => {
    expect(headlineText(comparisonPoint({ ratio: interval(1.05, 1.12, 1.2) })).range).toBe(
      'Run against Ride, 90% range: 5% to 20%.',
    )
  })

  it('names cycling first when cycling leads, in the same figures the Balance sentence and meter give', () => {
    const point = comparisonPoint({ ratio: interval(0.75, 0.8, 0.9) })
    const reading = energyReading(point.ratio)
    expect(headlineText(point).range).toBe('Ride against Run, 90% range: 11% to 33%.')
    expect(balanceSentence(reading)).toBe(
      'Cycling 25% higher, as energy per kilogram (range 11% to 33%)',
    )
    expect(rangeText(reading)).toBe('11% to 33%')
  })

  it('keeps the signed running-against-cycling range when the two are even', () => {
    expect(headlineText(comparisonPoint({ ratio: interval(0.98, 1.01, 1.04) })).range).toBe(
      'Run against Ride, 90% range: -2% to +4%.',
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
    expect(headlineBasis(accepted, true)).toBe(
      'Model range adjusted using the heart-rate data across all your activities.',
    )
  })

  it('says the range uses population assumptions otherwise', () => {
    expect(headlineBasis(comparison(), false)).toBe('Model range based on population assumptions.')
  })
})

describe('referenceText', () => {
  it('is null when neither sport has a heart-rate maximum', () => {
    expect(referenceText(makeResult())).toBeNull()
  })

  it('gives each sport its own highest sustained heart rate, with no parenthetical', () => {
    const result = makeResult({
      runMaxHeartRate: 188,
      runObservedMaxHeartRate: 188,
      rideMaxHeartRate: 182,
      rideObservedMaxHeartRate: 182,
    })
    expect(referenceText(result)).toBe(
      'Best efforts are judged against running 188 bpm; cycling 182 bpm.',
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
      'Best efforts are judged against running 188 bpm; cycling 182 bpm (6 bpm below your running maximum).',
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
      'Best efforts are judged against running 182 bpm (your cycling maximum); cycling 182 bpm.',
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
      'Best efforts are judged against running 185 bpm (your cycling maximum); cycling 185 bpm.',
    )
  })

  it('rounds each reference to whole beats per minute', () => {
    const result = makeResult({
      runMaxHeartRate: 187.6,
      runObservedMaxHeartRate: 187.6,
      rideMaxHeartRate: null,
    })
    expect(referenceText(result)).toBe('Best efforts are judged against running 188 bpm.')
  })

  it('names only the sport that has a reference', () => {
    const result = makeResult({
      runMaxHeartRate: null,
      rideMaxHeartRate: 182,
      rideObservedMaxHeartRate: 182,
    })
    expect(referenceText(result)).toBe('Best efforts are judged against cycling 182 bpm.')
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
  it('leads with the grade gap’s best estimate and states its range, on the headline duration', () => {
    expect(balanceSummary(gapReading(gap({ centre: 6, lean: 'run' })), 1200)).toBe(
      'Running’s age grade is 6 points higher than cycling’s at 20\u00a0min, within 2 to 10\u00a0points.',
    )
  })

  it('names cycling as the leader when cycling grades higher, with its range from its own side', () => {
    expect(
      balanceSummary(gapReading(gap({ centre: -6, low: -10, high: -2, lean: 'ride' })), 1200),
    ).toBe(
      'Cycling’s age grade is 6 points higher than running’s at 20\u00a0min, within 2 to 10\u00a0points.',
    )
  })

  it('still says a lead of 9 points when its range reaches below zero, and gives the range signed', () => {
    expect(
      balanceSummary(gapReading(gap({ centre: 9, low: -4, high: 18, lean: 'run' })), 1200),
    ).toBe(
      'Running’s age grade is 9 points higher than cycling’s at 20\u00a0min, within −4 to +18\u00a0points.',
    )
    expect(
      balanceSummary(gapReading(gap({ centre: -9, low: -18, high: 4, lean: 'ride' })), 1200),
    ).toBe(
      'Cycling’s age grade is 9 points higher than running’s at 20\u00a0min, within −4 to +18\u00a0points.',
    )
  })

  it('uses the singular for a gap of one point, and leaves out a range that is one value', () => {
    expect(balanceSummary(gapReading(gap({ centre: 3, low: 3, high: 3 })), 1200)).toBe(
      'Running’s age grade is 3 points higher than cycling’s at 20\u00a0min.',
    )
    expect(
      balanceSummary(gapReading(gap({ centre: 1, low: 1, high: 3, lean: 'even' })), 1200),
    ).toMatch(
      /is 1 point higher than cycling’s at 20\u00a0min, within 1 to 3\u00a0points, so the two are level\.$/,
    )
  })

  it('says the two are level only for an estimate within two points, and gives the range signed', () => {
    expect(
      balanceSummary(gapReading(gap({ centre: 2, low: -2, high: 6, lean: 'even' })), 1200),
    ).toBe(
      'Running’s age grade is 2 points higher than cycling’s at 20\u00a0min, within −2 to +6\u00a0points, so the two are level.',
    )
  })

  it('says the two grade the same when the best estimate is zero', () => {
    expect(
      balanceSummary(gapReading(gap({ centre: 0, low: -2, high: 2, lean: 'even' })), 1200),
    ).toBe(
      'Running and cycling have the same age grade at 20\u00a0min, within −2 to +2\u00a0points, so the two are level.',
    )
  })

  it('names the side of a level estimate whose range is lopsided, and not one that is symmetric', () => {
    expect(
      balanceSummary(gapReading(gap({ centre: 0.2, low: -1, high: 3, lean: 'even' })), 1200),
    ).toBe(
      'Running and cycling have the same age grade at 20\u00a0min, within −1 to +3\u00a0points (running minus cycling), so the two are level.',
    )
  })

  it('names cycling when its best estimate leads a level balance, with its range from its own side', () => {
    expect(
      balanceSummary(gapReading(gap({ centre: -2, low: -6, high: 2, lean: 'even' })), 1200),
    ).toBe(
      'Cycling’s age grade is 2 points higher than running’s at 20\u00a0min, within −2 to +6\u00a0points, so the two are level.',
    )
  })

  it('states the energy ratio, with the duration, and its range, when the balance is only an energy reading', () => {
    expect(balanceSummary(energyReading(interval(1.05, 1.12, 1.2)), 300)).toBe(
      'Over 5 min, your running is 12% higher than your cycling, within 5% to 20%, as energy per kilogram.',
    )
  })

  it('names an hour in the energy ratio in minutes, as the records list does', () => {
    expect(balanceSummary(energyReading(interval(1.05, 1.12, 1.2)), 3600)).toBe(
      'Over 60 min, your running is 12% higher than your cycling, within 5% to 20%, as energy per kilogram.',
    )
  })

  it('signs an energy range that reaches the other sport’s side', () => {
    expect(balanceSummary(energyReading(interval(0.98, 1.12, 1.3)), 1200)).toBe(
      'Over 20 min, your running is 12% higher than your cycling, within -2% to +30%, as energy per kilogram.',
    )
  })

  it('says a level energy ratio with its signed range', () => {
    expect(balanceSummary(energyReading(interval(0.97, 1, 1.04)), 1200)).toMatch(
      /^Over 20 min, your running and your cycling are level as energy per kilogram, within /,
    )
  })

  it.each([
    ['a grade gap', gapReading(gap())],
    ['an even grade gap', gapReading(gap({ centre: 1, low: -2, high: 4, lean: 'even' }))],
    ['a lead across zero', gapReading(gap({ centre: 9, low: -4, high: 18, lean: 'run' }))],
    ['a cycling energy lead', energyReading(interval(0.75, 0.8, 0.9))],
    ['an even energy ratio', energyReading(interval(0.95, 1, 1.05))],
  ])('never says ahead of, limiter, weak or strength for %s', (_name, reading) => {
    expect(`${balanceTitle(reading)} ${balanceSummary(reading, 1200)}`).not.toMatch(FORBIDDEN)
  })
})

describe('balanceSentence', () => {
  it('names the leading sport, its gap in points and the range, for a grade gap', () => {
    expect(balanceSentence(gapReading(gap({ centre: 6, low: 2, high: 10, lean: 'run' })))).toBe(
      'Running grades 6 points higher than cycling (range 2 to 10\u00a0points)',
    )
  })

  it('names cycling and its range the same way when cycling grades higher', () => {
    expect(balanceSentence(gapReading(gap({ centre: -6, low: -10, high: -2, lean: 'ride' })))).toBe(
      'Cycling grades 6 points higher than running (range 2 to 10\u00a0points)',
    )
  })

  it('states the gap and its range in words when the grades are in balance', () => {
    expect(balanceSentence(gapReading(gap({ centre: 4, low: -2, high: 10, lean: 'even' })))).toBe(
      'In balance: running 4 points higher, range −2 to +10\u00a0points',
    )
  })

  it('says how far running is higher, as energy per kilogram, with the range', () => {
    expect(balanceSentence(energyReading(interval(1.05, 1.12, 1.2)))).toBe(
      'Running 12% higher, as energy per kilogram (range 5% to 20%)',
    )
  })

  it('says how far cycling is higher, as energy per kilogram, with the range', () => {
    expect(balanceSentence(energyReading(interval(0.75, 0.8, 0.9)))).toBe(
      'Cycling 25% higher, as energy per kilogram (range 11% to 33%)',
    )
  })

  it('says the balance is even within the range when the range spans 1', () => {
    expect(balanceSentence(energyReading(interval(0.95, 1, 1.05)))).toBe(
      'Level as energy per kilogram (running against cycling -5% to +5%)',
    )
  })
})

describe('rangeText', () => {
  it('gives the range as magnitudes in the leading sport, in points', () => {
    expect(rangeText(gapReading(gap({ centre: 6, low: 2, high: 10, lean: 'run' })))).toBe(
      '2 to 10\u00a0points',
    )
  })

  it('gives a cycling range as magnitudes too, since its lead is negative', () => {
    expect(rangeText(gapReading(gap({ centre: -6, low: -10, high: -2, lean: 'ride' })))).toBe(
      '2 to 10\u00a0points',
    )
  })

  it('signs the range of an even balance, running against cycling', () => {
    expect(rangeText(gapReading(gap({ centre: 4, low: -2, high: 10, lean: 'even' })))).toBe(
      '−2 to +10\u00a0points',
    )
  })

  it('keeps each number with its unit, so a line never breaks between them', () => {
    expect(rangeText(gapReading(gap({ centre: 6, low: 2, high: 10, lean: 'run' })))).not.toMatch(
      / points/,
    )
  })

  it('shows a percent edge that rounds to 0 with one decimal, so it reads as a value', () => {
    expect(rangeText(energyReading(interval(1.003, 1.12, 1.2)))).toBe('0.3% to 20%')
  })

  it('says a percent edge under a twentieth is under a tenth, rather than printing 0.0%', () => {
    expect(rangeText(energyReading(interval(1.0004, 1.12, 1.2)))).toBe('under 0.1% to 20%')
  })

  it('keeps a negative edge of a tenth signed, as in an even range', () => {
    expect(rangeText(energyReading(interval(0.999, 1, 1.02)))).toBe('-0.1% to +2%')
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
