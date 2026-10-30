import { describe as suite, expect, it } from 'vitest'
import { monitor, weekEndOf } from './machine'
import { describe } from './status'
import { simulate } from './test/runSim'
import type { UnitSeries } from './unit'
import type { RunPoint } from './windows'

const SERIES: UnitSeries = {
  points: [],
  referenceHr: 150,
  method: {
    tier: 'steady-pace',
    gradePassThrough: 1,
    speedPerBpm: 0.005,
    fitted: 100,
    seasonal: null,
  },
}

/** The status as of the end of week `w`, from the runs and the monitor's records up to it. */
const statusAt = (runs: readonly RunPoint[], records: ReturnType<typeof monitor>, w: number) =>
  describe(
    'run',
    SERIES,
    runs.filter((p) => p.t < (w + 1) * 7),
    records.slice(0, w + 1),
    weekEndOf(w),
  )

const JITTER = [0.012, -0.012, 0.004, -0.004, 0.008, -0.008]
function library(weeks: number, level: (week: number) => number): RunPoint[] {
  const points: RunPoint[] = []
  let k = 0
  for (let w = 0; w < weeks; w++) {
    for (let i = 0; i < 3; i++) {
      points.push({
        id: `h${w}-${i}`,
        t: w * 7 + 1 + i * 2,
        x: level(w) + JITTER[k++ % JITTER.length]!,
      })
    }
  }
  return points
}

suite('the status after an episode closes', () => {
  it('says "holding" with the old level in view, never "not enough evidence", on a drop that settled 1.5% under it', () => {
    // 8% down at week 60, 6.5% back at week 100: the episode closes as holding some weeks after it is recovering.
    const runs = library(220, (w) => (w >= 60 ? -0.08 : 0) + (w >= 100 ? 0.065 : 0))
    const records = monitor(runs, 0, 219)
    const closed = records.find((r) => r.closes !== null)!
    expect(closed).toBeDefined()
    for (let w = closed.w - 2; w < 220; w++) {
      const status = statusAt(runs, records, w)
      expect(['holding', 'holding-below', 'recovering']).toContain(status.state)
    }
  })

  it('does not turn a level an episode closed on into "not enough evidence" while the close is in view', () => {
    // 60 libraries with a drop of 8% and a partial return of 3%: those that close as holding, a wide range around a new level.
    let closedLibraries = 0
    let weeks = 0
    for (let seed = 1; seed <= 80; seed++) {
      const runs = simulate(
        {
          weeks: 230,
          perWeek: 3,
          planted: [
            { type: 'step', week: 60, size: -0.08 },
            { type: 'step', week: 100, size: 0.03 },
          ],
        },
        seed,
      )
      const records = monitor(runs, 0, 229)
      const close = records.find((r) => r.closes !== null && r.dip === null)
      if (close === undefined) continue
      closedLibraries++
      for (let w = close.w; w < Math.min(230, close.w + 40); w++) {
        weeks++
        expect(statusAt(runs, records, w).state, `seed ${seed} week ${w}`).not.toBe(
          'not-enough-evidence',
        )
      }
    }
    expect(closedLibraries).toBeGreaterThanOrEqual(5)
    expect(weeks).toBeGreaterThan(150)
  })
})
