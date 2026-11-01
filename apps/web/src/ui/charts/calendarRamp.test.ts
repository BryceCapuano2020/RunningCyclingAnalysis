import { describe, expect, it } from 'vitest'
import { RAMP_STEPS, rampOf } from './calendarRamp'

describe('rampOf', () => {
  it('has no tint for no training and five equal steps up to a clean ceiling', () => {
    const ramp = rampOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(ramp.ceiling).toBe(10)
    expect([0, 0.01, 2, 2.01, 4, 4.01, 6, 6.01, 8, 8.01, 10].map(ramp.stepOf)).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5,
    ])
    expect(ramp.stepOf(50)).toBe(RAMP_STEPS)
  })

  it('takes its ceiling near the 90th percentile, so one huge week does not wash the others out', () => {
    const ramp = rampOf([...Array.from({ length: 99 }, () => 5), 80])
    expect(ramp.ceiling).toBe(5)
    expect(ramp.stepOf(80)).toBe(RAMP_STEPS)
    expect(ramp.stepOf(2.5)).toBe(3)
  })

  it('leaves out weeks of no training from the ceiling, and works with none at all', () => {
    expect(rampOf([0, 0, 0, 3, 3, 3]).ceiling).toBe(3)
    const none = rampOf([])
    expect(none.ceiling).toBe(1)
    expect(none.stepOf(0)).toBe(0)
  })

  it('rounds a ceiling up to a number an athlete would say, and past the list to the next ten', () => {
    expect(rampOf([7]).ceiling).toBe(8)
    expect(rampOf([13.5]).ceiling).toBe(15)
    expect(rampOf([101]).ceiling).toBe(110)
  })
})
