import { describe, expect, it } from 'vitest'
import {
  analysisSettings,
  birthYearLimits,
  displayBirthYear,
  displayWeight,
  isBirthYear,
  readBirthYear,
  readWeight,
  weightKnown,
  weightWithinLimits,
} from './athlete'
import type { WeightSettings } from './athlete'

/** Fixed so the year limits do not move with the calendar: in 2026 the years run from 1920 to 2021. */
const THIS_YEAR = 2026

const NUMBER_ERROR = { error: 'Enter a number, such as 75 or 165.5' }

describe('weight reading', () => {
  it('reads a metric weight in kilograms, and an imperial one in pounds', () => {
    expect(readWeight('80', 'body', 'metric')).toEqual({ kg: 80 })
    expect(readWeight('170', 'body', 'imperial')).toEqual({
      kg: expect.closeTo(170 * 0.45359237, 6),
    })
  })

  it('accepts a decimal comma as well as a point', () => {
    expect(readWeight('75,5', 'body', 'metric')).toEqual({ kg: 75.5 })
  })

  it('takes a unit typed after the number over the units chosen', () => {
    expect(readWeight('150 lb', 'body', 'metric')).toEqual({
      kg: expect.closeTo(150 * 0.45359237, 6),
    })
    expect(readWeight('80kg', 'body', 'imperial')).toEqual({ kg: 80 })
  })

  it('rejects text that is not a decimal number, or a unit with no number', () => {
    expect(readWeight('heavy', 'body', 'metric')).toEqual(NUMBER_ERROR)
    expect(readWeight('', 'bike', 'metric')).toEqual(NUMBER_ERROR)
    expect(readWeight('lb', 'body', 'imperial')).toEqual(NUMBER_ERROR)
  })

  it('states the kilogram limits for each field', () => {
    expect(readWeight('250', 'body', 'metric')).toEqual({
      error: 'Enter a weight from 30 to 200 kg',
    })
    expect(readWeight('2', 'bike', 'metric')).toEqual({ error: 'Enter a weight from 3 to 30 kg' })
  })

  it('states the pound limits inside the kilogram limits for imperial', () => {
    expect(readWeight('50', 'body', 'imperial')).toEqual({
      error: 'Enter a weight from 67 to 440 lb',
    })
  })

  it('accepts exactly the pounds its message names, and refuses a fraction outside them', () => {
    expect(readWeight('67', 'body', 'imperial')).toEqual({ kg: expect.closeTo(67 * 0.45359237, 6) })
    expect(readWeight('440', 'body', 'imperial')).toEqual({
      kg: expect.closeTo(440 * 0.45359237, 6),
    })
    for (const text of ['66.5', '440.5']) {
      expect(readWeight(text, 'body', 'imperial'), text).toEqual({
        error: 'Enter a weight from 67 to 440 lb',
      })
    }
  })

  it('checks a bike weight in pounds against the pounds its message names', () => {
    expect(readWeight('6', 'bike', 'imperial')).toEqual({ error: 'Enter a weight from 7 to 66 lb' })
    expect(readWeight('7', 'bike', 'imperial')).toEqual({ kg: expect.closeTo(7 * 0.45359237, 6) })
  })

  it('checks a kilogram suffix typed in imperial against the kilogram limits', () => {
    expect(readWeight('250kg', 'body', 'imperial')).toEqual({
      error: 'Enter a weight from 30 to 200 kg',
    })
    expect(readWeight('80kg', 'body', 'imperial')).toEqual({ kg: 80 })
  })

  it('does not read a thousands separator as a decimal comma', () => {
    for (const units of ['metric', 'imperial'] as const) {
      expect(readWeight('1,000', 'body', units), units).toEqual(NUMBER_ERROR)
    }
    expect(readWeight('1,000 lb', 'body', 'metric')).toEqual(NUMBER_ERROR)
  })
})

describe('weight display', () => {
  it('shows one decimal, or a whole number when the value is within 0.05 of one', () => {
    expect(displayWeight(75, 'metric')).toBe('75')
    expect(displayWeight(75, 'imperial')).toBe('165.3')
    expect(displayWeight(80.02, 'metric')).toBe('80')
  })

  it('shows no weight as an empty field', () => {
    expect(displayWeight(null, 'metric')).toBe('')
    expect(displayWeight(null, 'imperial')).toBe('')
  })
})

describe('weight limits', () => {
  it('accept the body weights from 30 to 200 kg and the bike weights from 3 to 30 kg', () => {
    expect(weightWithinLimits(30, 'body')).toBe(true)
    expect(weightWithinLimits(200, 'body')).toBe(true)
    expect(weightWithinLimits(29.9, 'body')).toBe(false)
    expect(weightWithinLimits(3, 'bike')).toBe(true)
    expect(weightWithinLimits(30.1, 'bike')).toBe(false)
  })
})

describe('weight known', () => {
  it('is false until a body weight is entered, and the bike weight does not count', () => {
    expect(weightKnown({ massKg: null, bikeMassKg: 9 })).toBe(false)
    expect(weightKnown({ massKg: 75, bikeMassKg: 9 })).toBe(true)
  })

  it('is false for a body weight that is not a number, such as one missing from storage', () => {
    const missing = { bikeMassKg: 9 } as unknown as WeightSettings
    expect(weightKnown(missing)).toBe(false)
  })
})

describe('analysis settings', () => {
  it('keeps the weights as entered once a body weight is known', () => {
    expect(analysisSettings({ massKg: 82.5, bikeMassKg: 11 })).toEqual({
      massKg: 82.5,
      bikeMassKg: 11,
    })
  })

  it('gives the analysis the 75 kg the app used before weights were optional, while none is entered', () => {
    // The placeholder says it is one, so ride power is not judged against it.
    expect(analysisSettings({ massKg: null, bikeMassKg: 11 })).toEqual({
      massKg: 75,
      bikeMassKg: 11,
      massAssumed: true,
    })
    expect(analysisSettings({ massKg: 80, bikeMassKg: 11 })).toEqual({
      massKg: 80,
      bikeMassKg: 11,
    })
  })

  it('keeps the placeholder off the weight the athlete sees, which weightKnown reports', () => {
    const unset = { massKg: null, bikeMassKg: 9 }
    expect(weightKnown(unset)).toBe(false)
    expect(analysisSettings(unset).massKg).toBe(75)
  })
})

describe('birth year limits', () => {
  it('run from 1920 to five years before this year', () => {
    expect(birthYearLimits(THIS_YEAR)).toEqual({ min: 1920, max: 2021 })
  })

  it('accept only whole years in range', () => {
    expect(isBirthYear(1920, THIS_YEAR)).toBe(true)
    expect(isBirthYear(2021, THIS_YEAR)).toBe(true)
    expect(isBirthYear(1919, THIS_YEAR)).toBe(false)
    expect(isBirthYear(2022, THIS_YEAR)).toBe(false)
    expect(isBirthYear(1990.5, THIS_YEAR)).toBe(false)
    expect(isBirthYear('1990', THIS_YEAR)).toBe(false)
  })
})

describe('birth year reading', () => {
  it('reads an empty field as no year, which is allowed', () => {
    expect(readBirthYear('', THIS_YEAR)).toEqual({ year: null })
    expect(readBirthYear('   ', THIS_YEAR)).toEqual({ year: null })
  })

  it('reads four digits in range, ignoring surrounding spaces', () => {
    expect(readBirthYear(' 1990 ', THIS_YEAR)).toEqual({ year: 1990 })
  })

  it('rejects anything else, and says the range', () => {
    const message = { error: 'Enter a year from 1920 to 2021' }
    expect(readBirthYear('1800', THIS_YEAR)).toEqual(message)
    expect(readBirthYear('2030', THIS_YEAR)).toEqual(message)
    expect(readBirthYear('90', THIS_YEAR)).toEqual(message)
    expect(readBirthYear('19a0', THIS_YEAR)).toEqual(message)
  })

  it('shows a saved year as text, and no year as an empty field', () => {
    expect(displayBirthYear(1990)).toBe('1990')
    expect(displayBirthYear(null)).toBe('')
  })
})
