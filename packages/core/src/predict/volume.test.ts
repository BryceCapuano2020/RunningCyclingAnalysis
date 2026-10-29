import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { typicalWeeklyDistance } from './volume'

const run = (day: number, km: number) => ({ startMs: day * DAY_MS, distanceM: km * 1000 })

describe('typicalWeeklyDistance', () => {
  it('averages the eight weeks ending with the newest run', () => {
    const runs = Array.from({ length: 16 }, (_, i) => run(100 + i * 7, 10)).concat(run(0, 500))
    expect(typicalWeeklyDistance(runs)).toBeCloseTo(80_000 / 8, 6)
  })

  it('averages a shorter history over the weeks it spans, at least one', () => {
    expect(typicalWeeklyDistance([run(0, 10), run(14, 20)])).toBeCloseTo(10_000, 6)
    expect(typicalWeeklyDistance([run(0, 12)])).toBe(12_000)
    expect(typicalWeeklyDistance([])).toBe(0)
  })

  it('counts the weeks a short history covers, not one more', () => {
    for (const weeks of [1, 2, 4, 6, 7]) {
      const daily = Array.from({ length: weeks * 7 }, (_, d) => run(100 + d, 1))
      expect(typicalWeeklyDistance(daily)).toBeCloseTo(7_000, 6)
    }
    // Days are local dates: the hour of a run does not stretch or shrink the span.
    const at = (day: number, hour: number) => ({
      startMs: new Date(2026, 0, 1 + day, hour).getTime(),
      distanceM: 10_000,
    })
    // Late on the first day, early on the 29th: 29 calendar days, five weeks, though 27 days and 2 hours apart.
    expect(typicalWeeklyDistance([at(0, 23), at(28, 1)])).toBeCloseTo(4_000, 6)
    // Early on the first day, late on the 28th: 28 calendar days, four weeks, though 27 days and 22 hours apart.
    expect(typicalWeeklyDistance([at(0, 1), at(27, 23)])).toBeCloseTo(5_000, 6)
    // 23:00 and 01:00 the next morning are two days, still within the one week.
    expect(typicalWeeklyDistance([at(0, 23), at(1, 1)])).toBeCloseTo(20_000, 6)
  })
})
