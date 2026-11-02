import { describe, expect, it } from 'vitest'
import type { Period } from '@rca/core/period'
import { balanceTitle } from '../components/headlineText'
import type { BalanceReading } from '../components/balanceScale'
import { BALANCE_PAIR } from '../sports'
import { eyebrowText, titleParts } from './balanceCopy'

const points = (centre: number, low: number, high: number): BalanceReading => ({
  pair: BALANCE_PAIR,
  unit: 'points',
  lean: centre > 2 ? 'run' : centre < -2 ? 'ride' : 'even',
  lead: { centre, low, high },
})

describe('titleParts', () => {
  it.each([points(6, 1, 12), points(-9, -14, -3), points(1, -3, 5)])(
    'splits the headline without changing a word of it',
    (reading) => {
      const { lead, noun } = titleParts(reading)
      expect(`${lead}${noun}`).toBe(balanceTitle(reading))
    },
  )

  it('names the sport the balance leans toward last, so that word can be marked', () => {
    expect(titleParts(points(6, 1, 12))).toEqual({
      lead: 'Your balance leans toward ',
      sport: 'run',
      noun: 'running',
    })
    expect(titleParts(points(-9, -14, -3)).sport).toBe('ride')
  })

  it('marks no sport for a level balance', () => {
    expect(titleParts(points(1, -3, 5))).toMatchObject({ sport: null, noun: '' })
  })
})

describe('eyebrowText', () => {
  const dated = (days: number | null): Period => ({
    choice: days === null ? 'all' : (days as 42),
    startMs: new Date(2025, 3, 21, 12).getTime(),
    endMs: new Date(2025, 5, 3, 12).getTime(),
    days,
    fellBack: false,
  })

  it('names the length the period counts back over, and leaves the dates to the period line', () => {
    expect(eyebrowText(dated(42))).toBe('Last 6 weeks')
    expect(eyebrowText(dated(365))).toBe('Last 12 months')
  })

  it('says All time for no length', () => {
    expect(eyebrowText(dated(null))).toBe('All time')
  })

  it('names the window a default resolved to, with or without dates', () => {
    expect(
      eyebrowText({ choice: 'default', startMs: null, endMs: null, days: 84, fellBack: false }),
    ).toBe('Last 12 weeks')
  })

  it('calls a range entered a custom period', () => {
    expect(
      eyebrowText({
        choice: { from: '2025-04-21', to: '2025-06-03' },
        startMs: new Date(2025, 3, 21, 12).getTime(),
        endMs: new Date(2025, 5, 3, 12).getTime(),
        days: 44,
        fellBack: false,
      }),
    ).toBe('Custom period')
  })
})
