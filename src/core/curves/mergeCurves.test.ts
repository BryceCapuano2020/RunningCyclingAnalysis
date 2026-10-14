import { describe, expect, it } from 'vitest'
import type { CurvePoint } from '../types'
import { mergeCurves } from './mergeCurves'

const point = (
  durationS: number,
  value: number,
  activityId: string | null = null,
  startIndex = -1,
): CurvePoint => ({ durationS, value, activityId, startIndex })

describe('mergeCurves', () => {
  it('returns an empty curve for no input', () => {
    expect(mergeCurves([])).toEqual([])
  })

  it('returns an equal copy for a single curve', () => {
    const curve = [point(5, 300, 'a', 0), point(10, NaN)]
    const merged = mergeCurves([curve])
    expect(merged).toEqual(curve)
    expect(merged[0]).not.toBe(curve[0])
  })

  it('takes the pointwise best value, letting NaN lose to finite values', () => {
    const a = [point(5, 300, 'a', 0), point(10, NaN), point(15, 200, 'a', 4)]
    const b = [point(5, 280, 'b', 7), point(10, 270, 'b', 2), point(15, NaN)]
    expect(mergeCurves([a, b])).toEqual([
      point(5, 300, 'a', 0),
      point(10, 270, 'b', 2),
      point(15, 200, 'a', 4),
    ])
  })

  it('keeps the earlier curve on ties', () => {
    const a = [point(5, 300, 'a', 0)]
    const b = [point(5, 300, 'b', 9)]
    expect(mergeCurves([a, b])).toEqual([point(5, 300, 'a', 0)])
  })

  it('does not replace a NaN earlier point with a later NaN point', () => {
    const a = [point(5, NaN, 'a', 3)]
    const b = [point(5, NaN, 'b', 7)]
    expect(mergeCurves([a, b])).toEqual([point(5, NaN, 'a', 3)])
  })

  it('finds the best across three curves', () => {
    const a = [point(5, 100, 'a', 0)]
    const b = [point(5, 200, 'b', 1)]
    const c = [point(5, 150, 'c', 2)]
    expect(mergeCurves([a, b, c])).toEqual([point(5, 200, 'b', 1)])
  })

  it('throws when durations differ', () => {
    const a = [point(5, 1), point(10, 2)]
    const b = [point(5, 1), point(15, 2)]
    expect(() => mergeCurves([a, b])).toThrow(/same durations/)
  })

  it('throws when curve lengths differ', () => {
    const a = [point(5, 1), point(10, 2)]
    const b = [point(5, 1)]
    expect(() => mergeCurves([a, b])).toThrow(/same durations/)
  })

  it('throws when the duration order differs', () => {
    const a = [point(5, 1), point(10, 2)]
    const b = [point(10, 2), point(5, 1)]
    expect(() => mergeCurves([a, b])).toThrow(/same durations/)
  })
})
