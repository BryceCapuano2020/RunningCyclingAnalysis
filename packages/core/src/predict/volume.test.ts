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
})
