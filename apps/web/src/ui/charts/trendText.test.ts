import { describe, expect, it } from 'vitest'
import { windowCompound, windowPhrase } from './trendText'

describe('the trend window as words', () => {
  it('counts whole weeks, and falls back to days for a window that is not a whole number of weeks', () => {
    expect(windowPhrase(28)).toBe('4 weeks')
    expect(windowPhrase(30)).toBe('30 days')
  })

  it('opens a noun the same way: "4-week window", or "30-day window"', () => {
    expect(windowCompound(28)).toBe('4-week')
    expect(windowCompound(7)).toBe('1-week')
    expect(windowCompound(30)).toBe('30-day')
  })
})
