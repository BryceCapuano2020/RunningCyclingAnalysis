import { describe, expect, it } from 'vitest'
import type { Period } from '@rca/core/period'
import { balanceTitle } from '../components/headlineText'
import type { BalanceReading } from '../components/balanceScale'
import { eyebrowText, gapFigure, rangeVerdictText, titleParts } from './balanceCopy'

const points = (centre: number, low: number, high: number): BalanceReading => ({
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

describe('gapFigure', () => {
  it('signs the size, names the side, and states the range, for a lean toward running', () => {
    expect(gapFigure(points(6, 1, 12))).toEqual({
      number: '+6',
      unit: 'pts',
      side: 'toward running',
      range: '90% range\u00a01 to 12\u00a0points',
      note: 'toward running · 90% range 1 to 12 points',
    })
  })

  it('reads a lean toward cycling from cycling’s side', () => {
    const figure = gapFigure(points(-9, -14, -3))
    expect(figure.number).toBe('+9')
    expect(figure.note).toBe('toward cycling · 90% range 3 to 14 points')
  })

  it('writes a range that reaches zero with signs, as the headline does', () => {
    expect(gapFigure(points(5, -2, 12)).note).toBe(
      'toward running · 90% range\u00a0\u22122 to +12\u00a0points',
    )
  })

  it('says a gap of nothing is the same grade, and names no side', () => {
    expect(gapFigure(points(0, -3, 3))).toMatchObject({ number: '0', unit: 'pts' })
    expect(gapFigure(points(0, -3, 3)).note).toMatch(/^same grade · 90% range/)
  })

  it('gives an energy balance as a percent', () => {
    const energy: BalanceReading = {
      unit: 'percent',
      lean: 'run',
      lead: { centre: 12, low: 5, high: 20 },
    }
    expect(gapFigure(energy)).toMatchObject({ unit: '%', number: '+12' })
  })
})

describe('rangeVerdictText', () => {
  it('says the lead holds when the whole range is on the leading side', () => {
    expect(rangeVerdictText(points(6, 1, 12))).toBe('so the lead holds across the range')
    expect(rangeVerdictText(points(-6, -12, -1))).toBe('so the lead holds across the range')
  })

  it('says the two could be level when the range reaches zero or crosses it', () => {
    expect(rangeVerdictText(points(9, -4, 18))).toBe('so the two could be level')
    expect(rangeVerdictText(points(2, 0, 6))).toBe('so the two could be level')
  })

  it('says nothing about a range that rounds to one value', () => {
    expect(rangeVerdictText(points(6, 6.2, 5.8))).toBeNull()
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

  it('names the page, the length and the dates', () => {
    expect(eyebrowText(dated(42))).toBe('Balance · 6 weeks · 21 Apr – 3 Jun 2025')
  })

  it('says All time for no length', () => {
    expect(eyebrowText(dated(null))).toMatch(/^Balance · All time · /)
  })

  it('leaves out dates there are none of', () => {
    expect(
      eyebrowText({ choice: 'default', startMs: null, endMs: null, days: 84, fellBack: false }),
    ).toBe('Balance · 12 weeks')
  })
})
