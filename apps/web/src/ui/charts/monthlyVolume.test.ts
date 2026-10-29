import { describe, expect, it } from 'vitest'
import { DAY_MS } from '@rca/core/constants'
import { volumeRowsOf } from './monthlyVolume'
import type { VolumeWeek } from '../weeklyVolume'

/** Sunday 7 January 2024, 23:59:59.999 UTC. */
const FIRST_END = Date.UTC(2024, 0, 8) - 1
const HOUR = 3600

const weeks = (n: number, hours: (i: number) => [number, number]): VolumeWeek[] =>
  Array.from({ length: n }, (_, i) => ({
    endMs: FIRST_END + i * 7 * DAY_MS,
    seconds: { run: hours(i)[0] * HOUR, ride: hours(i)[1] * HOUR },
  }))

describe('volumeRowsOf', () => {
  it('keeps the weeks of a span of 26 weeks or less', () => {
    const data = volumeRowsOf(weeks(20, () => [3, 1]))
    expect(data.monthly).toBe(false)
    expect(data.rows).toHaveLength(20)
    expect(data.weeksIn.every((n) => n === 1)).toBe(true)
  })

  it('averages the hours a week over each month past 26 weeks, dated at its last week', () => {
    const data = volumeRowsOf(weeks(60, (i) => [i % 4 === 0 ? 8 : 2, 0]))
    expect(data.monthly).toBe(true)
    // January 2024 ends on the 7th, 14th, 21st and 28th: 8, 2, 2, 2 hours of running.
    expect(data.rows[0]?.seconds.run).toBeCloseTo(3.5 * HOUR)
    expect(data.rows[0]?.endMs).toBe(FIRST_END + 3 * 7 * DAY_MS)
    expect(data.weeksIn[0]).toBe(4)
    expect(data.rows.length).toBeLessThan(20)
  })

  it('counts a month of five weeks no taller than a month of four', () => {
    const data = volumeRowsOf(weeks(60, () => [4, 2]))
    for (const row of data.rows) {
      expect(row.seconds.run).toBeCloseTo(4 * HOUR)
      expect(row.seconds.ride).toBeCloseTo(2 * HOUR)
    }
  })

  it('accounts for every week once: the hours a week times the weeks add up to the weeks’ own total', () => {
    const input = weeks(70, (i) => [(i % 5) + 1, i % 3])
    const data = volumeRowsOf(input)
    const total = data.rows.reduce(
      (sum, row, i) => sum + (row.seconds.run + row.seconds.ride) * (data.weeksIn[i] ?? 0),
      0,
    )
    const own = input.reduce((sum, w) => sum + w.seconds.run + w.seconds.ride, 0)
    expect(total).toBeCloseTo(own)
  })
})
