import { describe, expect, it } from 'vitest'
import type { CurvePoint } from '../types'
import { ENVELOPE_TIE_TOLERANCE, monotoneEnvelope } from './monotoneEnvelope'

const point = (
  durationS: number,
  value: number,
  activityId: string | null = null,
  startIndex = -1,
): CurvePoint => ({ durationS, value, activityId, startIndex })

describe('monotoneEnvelope float ties', () => {
  it('keeps its own window for a point that is lower only by float noise, as on a constant effort', () => {
    // A steady effort: the mean over a shorter window differs from the longer one in the last bit.
    const longer = 250
    const shorter = longer - longer * 1e-14
    expect(shorter).toBeLessThan(longer)
    const curve = [point(1200, shorter, 'a', 10), point(3600, longer, 'b', 20)]
    const out = monotoneEnvelope(curve)
    expect(out[0]).toEqual(point(1200, shorter, 'a', 10))
    expect(out[1]).toEqual(point(3600, longer, 'b', 20))
  })

  it('still copies from a longer effort when the point is lower by more than the tolerance', () => {
    const longer = 250
    const lower = longer * (1 - 10 * ENVELOPE_TIE_TOLERANCE)
    const out = monotoneEnvelope([point(1200, lower, 'a', 10), point(3600, longer, 'b', 20)])
    expect(out[0]).toEqual(point(1200, longer, 'b', 20))
  })

  it('judges a drop by its share of the value, so it holds at the size of a speed and of watts', () => {
    for (const value of [3.5, 250, 1400]) {
      const noise = monotoneEnvelope([
        point(1200, value * (1 - ENVELOPE_TIE_TOLERANCE / 10), 'a', 1),
        point(3600, value, 'b', 2),
      ])
      expect(noise[0]?.activityId).toBe('a')
    }
  })
})

describe('monotoneEnvelope', () => {
  it('on a tie, a lower point copies the fields of the longest tied point', () => {
    const curve = [point(60, NaN), point(180, 10, 'b', 200), point(300, 10, 'a', 100)]
    const out = monotoneEnvelope(curve)
    expect(out[0]).toEqual(point(60, 10, 'a', 100))
    expect(out[1]).toEqual(point(180, 10, 'b', 200))
  })

  it('returns an empty curve for empty input', () => {
    expect(monotoneEnvelope([])).toEqual([])
  })

  it('fills NaN and lowers values from longer durations', () => {
    const curve = [
      point(5, 300, 'a', 0),
      point(10, 320, 'b', 3),
      point(15, NaN),
      point(20, 280, 'c', 9),
    ]
    expect(monotoneEnvelope(curve)).toEqual([
      point(5, 320, 'b', 3),
      point(10, 320, 'b', 3),
      point(15, 280, 'c', 9),
      point(20, 280, 'c', 9),
    ])
  })

  it('leaves an already non-increasing curve unchanged', () => {
    const curve = [point(5, 400, 'a', 0), point(10, 350, 'a', 5), point(20, 300, 'a', 15)]
    expect(monotoneEnvelope(curve)).toEqual(curve)
  })

  it('keeps the shorter point when its value ties the longer one', () => {
    const curve = [point(5, 300, 'a', 0), point(10, 300, 'b', 4)]
    expect(monotoneEnvelope(curve)).toEqual([point(5, 300, 'a', 0), point(10, 300, 'b', 4)])
  })

  it('keeps all-NaN curves NaN', () => {
    const curve = [point(5, NaN), point(10, NaN)]
    expect(monotoneEnvelope(curve)).toEqual(curve)
  })

  it('handles input ordered from longest to shortest and preserves that order', () => {
    const curve = [point(20, 280, 'c', 9), point(15, NaN), point(10, 320, 'b', 3), point(5, 300)]
    expect(monotoneEnvelope(curve)).toEqual([
      point(20, 280, 'c', 9),
      point(15, 280, 'c', 9),
      point(10, 320, 'b', 3),
      point(5, 320, 'b', 3),
    ])
  })

  it('carries the window fields of the point it takes its value from', () => {
    type Windowed = CurvePoint & { windowS: number; heartRate: number }
    const curve: Windowed[] = [
      { durationS: 5, value: NaN, activityId: null, startIndex: -1, windowS: 5, heartRate: NaN },
      { durationS: 10, value: 300, activityId: 'a', startIndex: 40, windowS: 10, heartRate: 150 },
      { durationS: 20, value: 320, activityId: 'a', startIndex: 0, windowS: 20, heartRate: 160 },
    ]
    expect(monotoneEnvelope(curve)).toEqual([
      { durationS: 5, value: 320, activityId: 'a', startIndex: 0, windowS: 20, heartRate: 160 },
      { durationS: 10, value: 320, activityId: 'a', startIndex: 0, windowS: 20, heartRate: 160 },
      { durationS: 20, value: 320, activityId: 'a', startIndex: 0, windowS: 20, heartRate: 160 },
    ])
  })

  it('does not mutate its input', () => {
    const curve = [point(5, 300, 'a', 0), point(10, NaN)]
    const snapshot = curve.map((p) => ({ ...p }))
    const out = monotoneEnvelope(curve)
    expect(curve).toEqual(snapshot)
    expect(out).not.toBe(curve)
    expect(out[0]).not.toBe(curve[0])
  })
})
