import { describe, expect, it } from 'vitest'
import { week } from './sharedTrendFixtures'
import { trendRowsOf } from './sharedTrendRows'

const weeks = (n: number, pick: (i: number) => [number | null, number | null]) =>
  Array.from({ length: n }, (_, i) => week(i, ...pick(i)))

describe('trendRowsOf', () => {
  it('keeps every week of a span of 26 weeks, each standing for itself', () => {
    const data = trendRowsOf(weeks(20, () => [0.6, 0.5]))
    expect(data.monthly).toBe(false)
    expect(data.rows).toHaveLength(20)
    expect(data.weeksIn.every((n) => n === 1)).toBe(true)
  })

  it('averages a month past 26 weeks, the range with the value, and ends on the latest week', () => {
    const data = trendRowsOf(weeks(60, (i) => [i % 2 === 0 ? 0.6 : 0.7, 0.5]))
    expect(data.monthly).toBe(true)
    expect(data.rows.length).toBeLessThan(20)
    // January 2024's weeks end on the 7th, 14th, 21st and 28th: 0.6, 0.7, 0.6, 0.7.
    expect(data.rows[0]?.run).toBeCloseTo(0.65)
    expect(data.rows[0]?.rideLow).toBeCloseTo(0.47)
    expect(data.rows[0]?.rideHigh).toBeCloseTo(0.53)
    expect(data.weeksIn[0]).toBe(4)
    expect(data.rows.at(-1)).toEqual(week(59, 0.7, 0.5))
    expect(data.weeksIn.reduce((sum, n) => sum + n, 0)).toBe(60)
  })

  it('breaks a line after eight weeks with no value, and bridges seven', () => {
    const gap = (empty: number) =>
      trendRowsOf(weeks(20, (i) => [i >= 3 && i < 3 + empty ? null : 0.6, 0.5]))
    expect(gap(7).breaks.run.some(Boolean)).toBe(false)
    const eight = gap(8)
    expect(eight.breaks.run.filter(Boolean)).toHaveLength(1)
    expect(eight.breaks.run[11]).toBe(true)
    // The ride has a value every week, so it never breaks.
    expect(eight.breaks.ride.some(Boolean)).toBe(false)
  })

  it('keeps a gap as a break when the weeks are drawn by the month', () => {
    const data = trendRowsOf(weeks(80, (i) => [i >= 30 && i < 50 ? null : 0.6, null]))
    expect(data.monthly).toBe(true)
    const at = data.breaks.run.indexOf(true)
    expect(at).toBeGreaterThan(0)
    expect(data.breaks.run.filter(Boolean)).toHaveLength(1)
    // The row that resumes holds the week that did.
    expect(data.rows[at]?.run).not.toBeNull()
  })
})
