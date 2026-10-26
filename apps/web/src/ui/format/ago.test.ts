import { describe, expect, it } from 'vitest'
import { agoText } from './ago'

describe('agoText', () => {
  it('says today for none, and for a day after today', () => {
    expect(agoText(0)).toBe('today')
    expect(agoText(-3)).toBe('today')
  })

  it('counts days to two weeks, then weeks, months to 23 months, and years from two years', () => {
    expect(agoText(1)).toBe('1 day ago')
    expect(agoText(13)).toBe('13 days ago')
    expect(agoText(14)).toBe('2 weeks ago')
    expect(agoText(59)).toBe('8 weeks ago')
    expect(agoText(60)).toBe('2 months ago')
    expect(agoText(365)).toBe('12 months ago')
    expect(agoText(700)).toBe('23 months ago')
    expect(agoText(730)).toBe('2 years ago')
    expect(agoText(1826)).toBe('5 years ago')
  })

  it('rounds to the nearest whole unit', () => {
    // 391 days is 12.85 months, which reads as the nearest whole month.
    expect(agoText(391)).toBe('13 months ago')
  })
})
