import { describe, expect, it } from 'vitest'
import { meanMaximal } from './meanMaximal'

const ones = (n: number) => new Uint8Array(n).fill(1)

describe('meanMaximal', () => {
  it('finds the best mean window for each duration on a hand-computed array', () => {
    const values = new Float64Array([10, 20, 30, 40, 50])
    const curve = meanMaximal(values, ones(5), [1, 2, 3, 5], 'a')
    expect(curve).toEqual([
      { durationS: 1, value: 50, activityId: 'a', startIndex: 4 },
      { durationS: 2, value: 45, activityId: 'a', startIndex: 3 },
      { durationS: 3, value: 40, activityId: 'a', startIndex: 2 },
      { durationS: 5, value: 30, activityId: 'a', startIndex: 0 },
    ])
  })

  it('skips windows that contain an invalid sample', () => {
    const values = new Float64Array([100, 200, 300, 400, 500, 600])
    const valid = new Uint8Array([1, 1, 0, 1, 1, 1])
    const curve = meanMaximal(values, valid, [1, 2, 3, 4], 'a')
    expect(curve).toEqual([
      { durationS: 1, value: 600, activityId: 'a', startIndex: 5 },
      { durationS: 2, value: 550, activityId: 'a', startIndex: 4 },
      { durationS: 3, value: 500, activityId: 'a', startIndex: 3 },
      { durationS: 4, value: NaN, activityId: null, startIndex: -1 },
    ])
  })

  it('treats a valid-flagged NaN sample as unusable', () => {
    const values = new Float64Array([100, NaN, 300, 400])
    const curve = meanMaximal(values, ones(4), [1, 2], 'a')
    expect(curve).toEqual([
      { durationS: 1, value: 400, activityId: 'a', startIndex: 3 },
      { durationS: 2, value: 350, activityId: 'a', startIndex: 2 },
    ])
  })

  it('keeps the earliest window on ties', () => {
    const values = new Float64Array([5, 10, 10, 5, 10])
    const curve = meanMaximal(values, ones(5), [1, 2, 3], 'a')
    expect(curve[0]).toEqual({ durationS: 1, value: 10, activityId: 'a', startIndex: 1 })
    expect(curve[1]).toEqual({ durationS: 2, value: 10, activityId: 'a', startIndex: 1 })
    expect(curve[2]!.value).toBeCloseTo(25 / 3, 12)
    expect(curve[2]!.startIndex).toBe(0)
  })

  it('returns the constant value at the first index for a constant array', () => {
    const values = new Float64Array(10).fill(250)
    const curve = meanMaximal(values, ones(10), [5, 10], 'ride')
    expect(curve).toEqual([
      { durationS: 5, value: 250, activityId: 'ride', startIndex: 0 },
      { durationS: 10, value: 250, activityId: 'ride', startIndex: 0 },
    ])
  })

  it('returns a no-window point when the duration exceeds the sample count', () => {
    const values = new Float64Array([1, 2, 3])
    const curve = meanMaximal(values, ones(3), [4, 3], 'a')
    expect(curve).toEqual([
      { durationS: 4, value: NaN, activityId: null, startIndex: -1 },
      { durationS: 3, value: 2, activityId: 'a', startIndex: 0 },
    ])
  })

  it('returns no-window points when every sample is invalid', () => {
    const curve = meanMaximal(new Float64Array([1, 5]), new Uint8Array(2), [1, 2], 'a')
    expect(curve).toEqual([
      { durationS: 1, value: NaN, activityId: null, startIndex: -1 },
      { durationS: 2, value: NaN, activityId: null, startIndex: -1 },
    ])
  })

  it('returns no-window points for empty input', () => {
    const curve = meanMaximal(new Float64Array(0), new Uint8Array(0), [1, 2], 'a')
    expect(curve.map((p) => p.value)).toEqual([NaN, NaN])
    expect(curve.map((p) => p.startIndex)).toEqual([-1, -1])
  })

  it('returns an empty curve for no durations', () => {
    expect(meanMaximal(new Float64Array([1, 2]), ones(2), [], 'a')).toEqual([])
  })

  it('treats non-integer and non-positive durations as having no window', () => {
    const curve = meanMaximal(new Float64Array([1, 2, 3]), ones(3), [0, 2.5], 'a')
    expect(curve).toEqual([
      { durationS: 0, value: NaN, activityId: null, startIndex: -1 },
      { durationS: 2.5, value: NaN, activityId: null, startIndex: -1 },
    ])
  })
})

describe('meanMaximal from a first start', () => {
  const values = new Float64Array([90, 80, 10, 20, 30, 40])

  it('scores only windows that start at the first start or later', () => {
    const curve = meanMaximal(values, ones(6), [1, 2, 4], 'a', 2)
    expect(curve.map((p) => [p.value, p.startIndex])).toEqual([
      [40, 5],
      [35, 4],
      [25, 2],
    ])
  })

  it('has no window when none fits after the first start', () => {
    const curve = meanMaximal(values, ones(6), [4], 'a', 3)
    expect(curve[0]!.startIndex).toBe(-1)
    expect(curve[0]!.value).toBeNaN()
  })

  it('is the whole-array result by default', () => {
    expect(meanMaximal(values, ones(6), [2], 'a')).toEqual(
      meanMaximal(values, ones(6), [2], 'a', 0),
    )
    expect(meanMaximal(values, ones(6), [2], 'a')[0]!.value).toBe(85)
  })
})

describe('meanMaximal with an occupancy requirement', () => {
  const values = new Float64Array([10, 10, 10, 10, 10, 1, 1, 1, 1, 1])

  it('skips a window that is mostly not moving, whatever its mean', () => {
    // Samples 3 to 6 are stopped: the 5 s window over 2..6 has 1 moving sample of 5.
    const moving = Uint8Array.from([1, 1, 1, 0, 0, 0, 0, 1, 1, 1])
    const plain = meanMaximal(values, ones(10), [5], 'a')[0]!
    const gated = meanMaximal(values, ones(10), [5], 'a', 0, { moving, minFraction: 0.9 })[0]!
    expect(plain.startIndex).toBe(0)
    // Only a window with all five moving would pass, and there is none.
    expect(gated.startIndex).toBe(-1)
    expect(gated.value).toBeNaN()
  })

  it('keeps a window that is stopped for less than the allowed share', () => {
    const moving = ones(10)
    moving[2] = 0
    // 4 of 5 moving is 80%: kept at 0.8, skipped at 0.9. The best all-moving window starts at 3.
    const kept = meanMaximal(values, ones(10), [5], 'a', 0, { moving, minFraction: 0.8 })[0]!
    expect(kept.startIndex).toBe(0)
    const strict = meanMaximal(values, ones(10), [5], 'a', 0, { moving, minFraction: 0.9 })[0]!
    expect(strict.startIndex).toBe(3)
    expect(strict.value).toBeCloseTo(4.6, 9)
  })

  it('is the plain result when everything is moving', () => {
    const occupancy = { moving: ones(10), minFraction: 0.9 }
    expect(meanMaximal(values, ones(10), [1, 3, 5, 10], 'a', 0, occupancy)).toEqual(
      meanMaximal(values, ones(10), [1, 3, 5, 10], 'a'),
    )
  })
})
