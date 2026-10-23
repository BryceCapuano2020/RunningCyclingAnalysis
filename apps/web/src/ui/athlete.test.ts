import { describe, expect, it } from 'vitest'
import {
  birthYearLimits,
  displayBirthYear,
  displayWeight,
  isBirthYear,
  readBirthYear,
  readWeight,
} from './athlete'

/** Fixed so the year limits do not move with the calendar: ages 5 to 100 in 2026 are 1926 to 2021. */
const THIS_YEAR = 2026

describe('weight reading', () => {
  it('reads a metric weight in kilograms, and an imperial one in pounds', () => {
    expect(readWeight('80', 'body', 'metric')).toEqual({ kg: 80 })
    expect(readWeight('170', 'body', 'imperial')).toEqual({
      kg: expect.closeTo(170 * 0.45359237, 6),
    })
  })

  it('rejects text that is not a decimal number', () => {
    expect(readWeight('heavy', 'body', 'metric')).toEqual({ error: 'Enter a number' })
    expect(readWeight('', 'bike', 'metric')).toEqual({ error: 'Enter a number' })
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
})

describe('weight display', () => {
  it('shows one decimal, or a whole number when the value is within 0.05 of one', () => {
    expect(displayWeight(75, 'metric')).toBe('75')
    expect(displayWeight(75, 'imperial')).toBe('165.3')
    expect(displayWeight(80.02, 'metric')).toBe('80')
  })
})

describe('birth year limits', () => {
  it('allow ages 5 to 100 this year', () => {
    expect(birthYearLimits(THIS_YEAR)).toEqual({ min: 1926, max: 2021 })
  })

  it('accept only whole years in range', () => {
    expect(isBirthYear(1926, THIS_YEAR)).toBe(true)
    expect(isBirthYear(2021, THIS_YEAR)).toBe(true)
    expect(isBirthYear(1925, THIS_YEAR)).toBe(false)
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
    const message = { error: 'Enter a year from 1926 to 2021' }
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
