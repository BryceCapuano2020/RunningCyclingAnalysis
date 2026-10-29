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
    // Runs at different times of day on the first and last day are still the same whole days apart.
    const morning = { startMs: 100 * DAY_MS + 7 * 3_600_000, distanceM: 10_000 }
    const evening = { startMs: 127 * DAY_MS + 17 * 3_600_000, distanceM: 10_000 }
    expect(typicalWeeklyDistance([morning, evening])).toBeCloseTo(5_000, 6)
  })
})
