import { describe, expect, it } from 'vitest'
import type { Comparison } from '@rca/core/types'
import type { BalanceGap } from '../balanceGap'
import { comparisonPoint, interval, makeResult } from './fixtures'
import { energyReading, gapReading } from './balanceScale'
import {
  balanceSentence,
  balanceTitle,
  energySummary,
  headlineBasis,
  headlineText,
  leadSentence,
  levelsTitle,
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
      'Running grades 6 points higher (4 to 8)',
    )
    expect(leadSentence(gapReading(gap({ centre: -6, low: -8, high: -4, lean: 'ride' })))).toBe(
      'Cycling grades 6 points higher (4 to 8)',
    )
    expect(leadSentence(gapReading(gap({ centre: 9, low: -4, high: 18, lean: 'run' })))).toBe(
      'Running grades 9 points higher (−4 to +18)',
    )
  })

  it('names the lead in percent of energy when there is no grade gap', () => {
    expect(leadSentence(energyReading(interval(1.05, 1.12, 1.2)))).toBe(
      'Running 12% higher in energy (5% to 20%)',
    )
  })

  it('says nothing of a lead within two percent, which the headline calls level', () => {
    expect(leadSentence(energyReading(interval(1.001, 1.003, 1.01)))).toBeNull()
    expect(leadSentence(energyReading(interval(0.9, 0.996, 0.999)))).toBeNull()
  })

  it('is the balance sentence with its range in the lede’s wording, so the card and the page agree', () => {
    const reading = gapReading(gap({ centre: 6, low: 4, high: 8, lean: 'run' }))
    expect(leadSentence(reading)).toContain('(4 to 8)')
    expect(balanceSentence(reading)).toContain(`(range ${rangeText(reading)})`)
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

  it('names the levels a held comparison can still show, and nothing when there are none', () => {
    expect(levelsTitle({ run: 'Local', ride: 'Recreational' })).toBe(
      'Running is at Local level, cycling at Recreational',
    )
    expect(levelsTitle({ run: 'Regional', ride: null })).toBe('Your running is at Regional level')
    expect(levelsTitle({ ride: 'Local' })).toBe('Your cycling is at Local level')
    expect(levelsTitle({ run: null, ride: null })).toBeNull()
  })

  it('says the range was informed when the heart-rate comparison is used', () => {
    const accepted = comparison({
      calibration: { effectiveSamples: 900, draws: 4000, accepted: true },
    })
    expect(headlineBasis(accepted, true)).toBe(
      'Model range informed by the heart-rate data across all your activities.',
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

describe('energySummary', () => {
  it('states the energy ratio, with the duration, and its range, when the balance is only an energy reading', () => {
    expect(energySummary(energyReading(interval(1.05, 1.12, 1.2)), 300)).toBe(
      'Over 5 min, your running is 12% higher than your cycling, within 5% to 20%, as energy per kilogram.',
    )
  })

  it('names an hour in the energy ratio in minutes, as the records list does', () => {
    expect(energySummary(energyReading(interval(1.05, 1.12, 1.2)), 3600)).toBe(
      'Over 60 min, your running is 12% higher than your cycling, within 5% to 20%, as energy per kilogram.',
    )
  })

  it('signs an energy range that reaches the other sport’s side', () => {
    expect(energySummary(energyReading(interval(0.98, 1.12, 1.3)), 1200)).toBe(
      'Over 20 min, your running is 12% higher than your cycling, within -2% to +30%, as energy per kilogram.',
    )
  })

  it('says a level energy ratio with its signed range', () => {
    expect(energySummary(energyReading(interval(0.97, 1, 1.04)), 1200)).toMatch(
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
    const words = [
      balanceTitle(reading),
      balanceSentence(reading),
      leadSentence(reading),
      energySummary(reading, 1200),
    ]
    expect(words.join(' ')).not.toMatch(FORBIDDEN)
  })
})

describe('balanceSentence', () => {
  it('names the leading sport, its gap in points and the range, for a grade gap', () => {
    expect(balanceSentence(gapReading(gap({ centre: 6, low: 2, high: 10, lean: 'run' })))).toBe(
      'Running grades 6 points higher than cycling (range 2 to 10\u00a0points)',
    )
  })

  it('leaves the range out where it rounds to one value, never "range 1 to 1 point"', () => {
    for (const lean of ['run', 'ride'] as const) {
      const centre = lean === 'run' ? 1 : -1
      const text = balanceSentence(gapReading(gap({ centre, low: centre, high: centre, lean })))
      expect(text).toMatch(/^(Running|Cycling) grades 1 point higher than (cycling|running)$/)
      expect(text).not.toMatch(/range/)
    }
    expect(balanceSentence(gapReading(gap({ centre: 0, low: 0, high: 0, lean: 'even' })))).toBe(
      'In balance: running and cycling have the same age grade',
    )
    expect(balanceSentence(gapReading(gap({ centre: 2, low: 2, high: 2, lean: 'even' })))).toBe(
      'In balance: running 2 points higher',
    )
  })

  it('leaves the range out of an even energy ratio that has none, too', () => {
    const reading = energyReading(interval(1.0, 1.0, 1.0))
    expect(balanceSentence(reading)).toBe('Level as energy per kilogram')
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
