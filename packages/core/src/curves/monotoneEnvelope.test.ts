import { describe, expect, it } from 'vitest'
import type { CurvePoint } from '../types'
import { monotoneEnvelope } from './monotoneEnvelope'

const point = (
  durationS: number,
  value: number,
  activityId: string | null = null,
  startIndex = -1,
): CurvePoint => ({ durationS, value, activityId, startIndex })

describe('monotoneEnvelope', () => {
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

  it('does not mutate its input', () => {
    const curve = [point(5, 300, 'a', 0), point(10, NaN)]
    const snapshot = curve.map((p) => ({ ...p }))
    const out = monotoneEnvelope(curve)
    expect(curve).toEqual(snapshot)
    expect(out).not.toBe(curve)
    expect(out[0]).not.toBe(curve[0])
  })
})
