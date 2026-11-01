import { describe, expect, it } from 'vitest'
import { RAMP_STEPS, rampOf } from './calendarRamp'

describe('rampOf', () => {
  it('has no tint for no training and five steps of one clean width: up to the first edge, over the last', () => {
    const ramp = rampOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(ramp.edges).toEqual([2, 4, 6, 8])
    expect([0, 0.01, 2, 2.01, 4, 4.01, 6, 6.01, 8, 8.01, 50].map(ramp.stepOf)).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5,
    ])
  })

  it('reads the same as its key: a cell is one tint more than the edges it is over', () => {
    for (const rates of [
      [1, 4, 12],
      [3, 3, 3],
      [0.2, 0.4, 0.3],
      [5, 9, 14, 30],
    ]) {
      const ramp = rampOf(rates)
      expect(ramp.edges).toHaveLength(RAMP_STEPS - 1)
      for (let rate = 0.01; rate < 60; rate += 0.01) {
        expect(ramp.stepOf(rate)).toBe(1 + ramp.edges.filter((edge) => rate > edge + 1e-6).length)
      }
    }
  })

  it('takes the width from near the 90th percentile, so one huge week does not wash the others out', () => {
    const ramp = rampOf([...Array.from({ length: 99 }, () => 5), 80])
    expect(ramp.edges).toEqual([1, 2, 3, 4])
    expect(ramp.stepOf(80)).toBe(RAMP_STEPS)
    expect(ramp.stepOf(2.5)).toBe(3)
  })

  it('leaves out weeks of no training from the width, and works with none at all', () => {
    expect(rampOf([0, 0, 0, 3, 3, 3]).edges).toEqual([1, 2, 3, 4])
    const none = rampOf([])
    expect(none.edges).toEqual([0.5, 1, 1.5, 2])
    expect(none.stepOf(0)).toBe(0)
  })

  it('rounds the width up to a number an athlete would say, and past the list to a multiple of five', () => {
    expect(rampOf([7]).edges).toEqual([1.5, 3, 4.5, 6])
    expect(rampOf([13.5]).edges).toEqual([3, 6, 9, 12])
    expect(rampOf([101]).edges).toEqual([25, 50, 75, 100])
  })
})
