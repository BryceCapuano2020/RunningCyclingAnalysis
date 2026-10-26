import { describe, expect, it } from 'vitest'
import { makeActivity } from './components/fixtures'
import { formLine } from './sportForm'

// 5 January 2026 is a Monday, in local time. The clock is pinned, so the year shows only when it differs.
const MON_5_JAN = new Date(2026, 0, 5, 7, 30).getTime()
const WED_14_JAN = new Date(2026, 0, 14, 7, 30).getTime()
const NOW = new Date(2026, 5, 10, 12).getTime()
const THU_15_MAY_2025 = new Date(2025, 4, 15, 9).getTime()

describe('formLine', () => {
  it('names the last run, the number of runs and their total distance', () => {
    const activities = [
      makeActivity({ id: 'a', sport: 'run', startMs: MON_5_JAN, distanceM: 10000 }),
      makeActivity({ id: 'b', sport: 'run', startMs: WED_14_JAN, distanceM: 5000 }),
      makeActivity({ id: 'c', sport: 'ride', startMs: WED_14_JAN + 1000, distanceM: 40000 }),
    ]
    expect(formLine(activities, 'run', 'metric', NOW)).toBe('Last run 14 Jan · 2 runs · 15.0 km')
  })

  it('uses the singular for one ride, in the units preference', () => {
    const activities = [
      makeActivity({ id: 'r', sport: 'ride', startMs: MON_5_JAN, distanceM: 16093.44 }),
    ]
    expect(formLine(activities, 'ride', 'imperial', NOW)).toBe('Last ride 5 Jan · 1 ride · 10.0 mi')
  })

  it('shows the year of a last run when the given time is in a later year', () => {
    const activities = [
      makeActivity({ id: 'a', sport: 'run', startMs: MON_5_JAN, distanceM: 5000 }),
    ]
    expect(formLine(activities, 'run', 'metric', new Date(2027, 0, 1).getTime())).toBe(
      'Last run 5 Jan 2026 · 1 run · 5.0 km',
    )
  })

  it('leaves the year off a last run from the year the given time is in', () => {
    const activities = [
      makeActivity({ id: 'a', sport: 'run', startMs: THU_15_MAY_2025, distanceM: 5000 }),
    ]
    expect(formLine(activities, 'run', 'metric', new Date(2025, 9, 1).getTime())).toBe(
      'Last run 15 May · 1 run · 5.0 km',
    )
  })

  it('is null when the sport has no activity', () => {
    expect(formLine([makeActivity({ id: 'c', sport: 'ride' })], 'run', 'metric', NOW)).toBeNull()
  })
})
