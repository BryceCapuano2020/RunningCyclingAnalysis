// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { extent, linearScale, logScale, niceDomain, niceTicks } from './scale'

describe('linearScale', () => {
  it('maps the domain ends onto the range ends', () => {
    const scale = linearScale([0, 10], [0, 100])
    expect(scale(0)).toBe(0)
    expect(scale(10)).toBe(100)
    expect(scale(5)).toBe(50)
  })

  it('handles a reversed range, as used for the y axis', () => {
    const scale = linearScale([0, 10], [100, 0])
    expect(scale(2.5)).toBe(75)
  })

  it('returns the middle of the range for a degenerate domain', () => {
    expect(linearScale([5, 5], [0, 100])(7)).toBe(50)
  })
})

describe('logScale', () => {
  it('maps values by their natural log', () => {
    const scale = logScale([1, 100], [0, 200])
    expect(scale(1)).toBeCloseTo(0, 10)
    expect(scale(10)).toBeCloseTo(100, 10)
    expect(scale(100)).toBeCloseTo(200, 10)
  })

  it('maps values at or below zero to NaN', () => {
    const scale = logScale([1, 100], [0, 200])
    expect(scale(0)).toBeNaN()
    expect(scale(-5)).toBeNaN()
  })

  it('places durations between the minute and the three-hour marks', () => {
    const scale = logScale([60, 10800], [0, 100])
    expect(scale(60)).toBeCloseTo(0, 10)
    expect(scale(10800)).toBeCloseTo(100, 10)
    // ln(300) / ln(10800) span: 5 min sits at ln(5)/ln(180) of the width
    expect(scale(300)).toBeCloseTo((100 * Math.log(5)) / Math.log(180), 10)
  })
})

describe('niceTicks', () => {
  it('uses a step of 2 for 0 to 10 in five intervals', () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10])
  })

  it('uses a step of 0.2 for 0 to 1', () => {
    expect(niceTicks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
  })

  it('uses a step of 5 when the raw step is just under 7', () => {
    expect(niceTicks(0, 35, 5)).toEqual([0, 5, 10, 15, 20, 25, 30, 35])
  })

  it('uses a step of 10 when the raw step is 9 or more', () => {
    expect(niceTicks(0, 90, 9)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90])
  })

  it('covers a range that crosses zero, with ticks inside it', () => {
    expect(niceTicks(-3, 7, 5)).toEqual([-2, 0, 2, 4, 6])
  })

  it('returns a single tick for a zero-width range and nothing for bad input', () => {
    expect(niceTicks(5, 5, 3)).toEqual([5])
    expect(niceTicks(0, 10, 0)).toEqual([])
    expect(niceTicks(Number.NaN, 10, 5)).toEqual([])
  })
})

describe('extent', () => {
  it('ignores non-finite values', () => {
    expect(extent([3, Number.NaN, -1, 7])).toEqual([-1, 7])
    expect(extent([3, Number.POSITIVE_INFINITY, -1, 7])).toEqual([-1, 7])
  })

  it('pads each side by the given fraction of the span', () => {
    expect(extent([0, 10], 0.5)).toEqual([-5, 15])
    expect(extent([3, NaN, -1, 7], 0.25)).toEqual([-3, 9])
  })

  it('returns [0, 1] when there are no finite values', () => {
    expect(extent([])).toEqual([0, 1])
    expect(extent([Number.NaN])).toEqual([0, 1])
  })
})

describe('niceDomain', () => {
  it('starts and ends on ticks that cover the padded data', () => {
    expect(niceDomain([3.1, 4.5], 4)).toEqual({
      domain: [3, 5],
      ticks: [3, 3.5, 4, 4.5, 5],
    })
  })

  it('does not pad when pad is zero', () => {
    expect(niceDomain([0, 10], 5, 0)).toEqual({
      domain: [0, 10],
      ticks: [0, 2, 4, 6, 8, 10],
    })
  })
})
