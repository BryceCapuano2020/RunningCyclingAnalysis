import { describe, expect, it } from 'vitest'
import { leanOfLead } from './lean'

describe('leanOfLead', () => {
  it('is running when the whole range is above zero', () => {
    expect(leanOfLead({ centre: 3, low: 1, high: 5 })).toBe('run')
  })

  it('is cycling when the whole range is below zero', () => {
    expect(leanOfLead({ centre: -3, low: -5, high: -1 })).toBe('ride')
  })

  it('is even when the range touches zero from above or below', () => {
    expect(leanOfLead({ centre: 2, low: 0, high: 4 })).toBe('even')
    expect(leanOfLead({ centre: -2, low: -4, high: 0 })).toBe('even')
  })

  it('is even when the range spans zero', () => {
    expect(leanOfLead({ centre: 1, low: -2, high: 4 })).toBe('even')
  })

  it('is even for a point at zero', () => {
    expect(leanOfLead({ centre: 0, low: 0, high: 0 })).toBe('even')
  })
})
