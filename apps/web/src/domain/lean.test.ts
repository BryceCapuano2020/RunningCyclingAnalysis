import { describe, expect, it } from 'vitest'
import { leanOfLead, leanOfRange } from './lean'

describe('leanOfLead', () => {
  it('leans toward running on a positive estimate beyond two points, whatever its range', () => {
    expect(leanOfLead({ centre: 9, low: -4, high: 18 })).toBe('run')
    expect(leanOfLead({ centre: 3, low: 1, high: 5 })).toBe('run')
  })

  it('leans toward cycling on a negative estimate beyond two points, whatever its range', () => {
    expect(leanOfLead({ centre: -9, low: -18, high: 4 })).toBe('ride')
    expect(leanOfLead({ centre: -3, low: -5, high: -1 })).toBe('ride')
  })

  it('is even within two points either way, however wide the range', () => {
    expect(leanOfLead({ centre: 2, low: 1, high: 3 })).toBe('even')
    expect(leanOfLead({ centre: -2, low: -30, high: 30 })).toBe('even')
    expect(leanOfLead({ centre: 0, low: 0, high: 0 })).toBe('even')
  })

  it('reads the estimate as the whole point the page shows', () => {
    expect(leanOfLead({ centre: 2.4, low: 0, high: 5 })).toBe('even')
    expect(leanOfLead({ centre: 2.6, low: 0, high: 5 })).toBe('run')
  })
})

describe('leanOfRange', () => {
  it('is running when the whole range is above zero', () => {
    expect(leanOfRange({ centre: 3, low: 1, high: 5 })).toBe('run')
  })

  it('is cycling when the whole range is below zero', () => {
    expect(leanOfRange({ centre: -3, low: -5, high: -1 })).toBe('ride')
  })

  it('is even when the range touches or spans zero', () => {
    expect(leanOfRange({ centre: 2, low: 0, high: 4 })).toBe('even')
    expect(leanOfRange({ centre: 9, low: -4, high: 18 })).toBe('even')
  })
})
