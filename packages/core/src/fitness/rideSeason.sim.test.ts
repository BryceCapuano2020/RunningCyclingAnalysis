import { describe, expect, it, vi } from 'vitest'
import { DAY_MS } from '../constants'
import { digestActivity } from '../digest/digestActivity'
import { buildLibrary, LIBRARY_END_MS } from '../synthetic/noise/library'
import { TUNING_CONFIGS } from '../synthetic/noise/tuningConfigs'
import { dayOfMs, replay, weekOfMs } from './machine'
import { rideSeries } from './rideUnit'

vi.setConfig({ testTimeout: 600_000 })

/**
 * Tuning configuration S, a rider with a 2.5% season on a 2.5% wander, through the app's own path (activities digested, the ride
 * unit, the monitor week by week), three years, nothing changing. It records where the false alarms fall: the season is fitted
 * and the floor learned only once two years of rides exist, so the first two years carry the monitor's documented exposure
 * (docs/design/fitness.md, "The first two years") and rides are no worse than runs at the same nuisance. Slip declarations an
 * athlete-year by year of the library, 16 libraries: 0.63, 0.56, 0.44.
 */
const WEEKS = 156
const LIBRARIES = 12

function slipsByYear(seed: number): number[] | null {
  const library = buildLibrary(TUNING_CONFIGS.S, seed, WEEKS)
  const digests = library.entries.map((e) => digestActivity(e.activity))
  const { points } = rideSeries(digests, 'ride', new Set())
  if (points.length < 8) return null
  const runs = points.map((p) => ({ id: p.id, t: dayOfMs(p.startMs), x: p.x }))
  const firstWeek = weekOfMs(LIBRARY_END_MS - WEEKS * 7 * DAY_MS)
  const { records } = replay(runs, weekOfMs(points[0]!.startMs), weekOfMs(LIBRARY_END_MS) - 1)
  const years = [0, 0, 0]
  for (const r of records) {
    if (r.state === 'slipping' && r.fresh) years[Math.floor((r.w - firstWeek) / 52)]!++
  }
  return years
}

describe('a rider with a marked season, nothing changing', () => {
  it('has its false alarms in the years before the season is fitted, and fewer after', () => {
    const total = [0, 0, 0]
    let used = 0
    for (let seed = 1; seed <= LIBRARIES; seed++) {
      const years = slipsByYear(seed)
      if (years === null) continue
      used++
      years.forEach((n, i) => (total[i]! += n))
    }
    expect(used).toBeGreaterThanOrEqual(LIBRARIES - 1)
    const [one, two, three] = total.map((n) => n / used) as [number, number, number]
    // The gap is known and recorded, not budgeted away: guard against it getting worse, and against the third year losing its edge.
    expect(one + two).toBeLessThan(2 * 1.0)
    expect(three).toBeLessThan((one + two) / 2 + 0.1)
  })
})
