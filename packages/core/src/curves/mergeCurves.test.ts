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

  it('copies the winning point whole, including extra fields', () => {
    type Windowed = CurvePoint & { heartRate: number }
    const a: Windowed[] = [
      { durationS: 5, value: 100, activityId: 'a', startIndex: 0, heartRate: 1 },
    ]
    const b: Windowed[] = [
      { durationS: 5, value: 200, activityId: 'b', startIndex: 3, heartRate: 2 },
    ]
    const merged = mergeCurves([a, b])
    expect(merged).toEqual([
      { durationS: 5, value: 200, activityId: 'b', startIndex: 3, heartRate: 2 },
    ])
    expect(merged[0]).not.toBe(b[0])
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

describe('mergeCurves ties between a measured and a carried point', () => {
  const measured = (value: number, id: string): CurvePoint => ({
    ...point(1200, value, id, 1),
    windowS: 1200,
  })
  const carried = (value: number, id: string): CurvePoint => ({
    ...point(1200, value, id, 2),
    windowS: 3600,
  })

  it('prefers the point measured over its own length, whichever curve it is in', () => {
    expect(mergeCurves([[carried(250, 'a')], [measured(250, 'b')]])[0]?.activityId).toBe('b')
    expect(mergeCurves([[measured(250, 'b')], [carried(250, 'a')]])[0]?.activityId).toBe('b')
  })

  it('treats a difference of float noise as a tie, so a 1-ulp higher carried value does not displace a measured one', () => {
    const noisy = 250 * (1 + 1e-12)
    expect(mergeCurves([[measured(250, 'b')], [carried(noisy, 'a')]])[0]?.activityId).toBe('b')
  })

  it('still takes the higher value when it is higher by more than float noise', () => {
    expect(mergeCurves([[measured(250, 'b')], [carried(251, 'a')]])[0]?.activityId).toBe('a')
    expect(mergeCurves([[carried(250, 'a')], [measured(251, 'b')]])[0]?.activityId).toBe('b')
  })

  it('keeps the earlier curve on a tie between two points of the same kind, as before', () => {
    expect(mergeCurves([[measured(250, 'a')], [measured(250, 'b')]])[0]?.activityId).toBe('a')
    expect(mergeCurves([[carried(250, 'a')], [carried(250, 'b')]])[0]?.activityId).toBe('a')
  })

  it('takes a point with no window, as on a curve made without digests, as measured', () => {
    expect(mergeCurves([[carried(250, 'a')], [point(1200, 250, 'b')]])[0]?.activityId).toBe('b')
  })
})
