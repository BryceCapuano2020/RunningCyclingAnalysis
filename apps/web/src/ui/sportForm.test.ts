import { describe, expect, it } from 'vitest'
import { makeActivity } from './components/fixtures'
import { formRows } from './sportForm'

// 5 January 2026 is a Monday, in local time. The clock is pinned, so the year shows only when it differs.
const MON_5_JAN = new Date(2026, 0, 5, 7, 30).getTime()
const WED_14_JAN = new Date(2026, 0, 14, 7, 30).getTime()
const NOW = new Date(2026, 5, 10, 12).getTime()
const THU_15_MAY_2025 = new Date(2025, 4, 15, 9).getTime()

describe('formRows', () => {
  it('names the last run and the total distance, with no count: the period’s rows give it', () => {
    const activities = [
      makeActivity({ id: 'a', sport: 'run', startMs: MON_5_JAN, distanceM: 10000 }),
      makeActivity({ id: 'b', sport: 'run', startMs: WED_14_JAN, distanceM: 5000 }),
      makeActivity({ id: 'c', sport: 'ride', startMs: WED_14_JAN + 1000, distanceM: 40000 }),
    ]
    expect(formRows(activities, 'run', 'metric', NOW)).toEqual([
      { label: 'Last run', value: '14 Jan' },
      { label: 'Distance', value: '15.0 km' },
    ])
  })

  it('names a ride, with its distance in the units preference', () => {
    const activities = [
      makeActivity({ id: 'r', sport: 'ride', startMs: MON_5_JAN, distanceM: 16093.44 }),
    ]
    expect(formRows(activities, 'ride', 'imperial', NOW)).toEqual([
      { label: 'Last ride', value: '5 Jan' },
      { label: 'Distance', value: '10.0 mi' },
    ])
  })

  it('shows the year of a last run when the given time is in a later year, and not in the same year', () => {
    const activities = [
      makeActivity({ id: 'a', sport: 'run', startMs: THU_15_MAY_2025, distanceM: 5000 }),
    ]
    expect(formRows(activities, 'run', 'metric', new Date(2027, 0, 1).getTime())[0]?.value).toBe(
      '15 May 2025',
    )
    expect(formRows(activities, 'run', 'metric', new Date(2025, 9, 1).getTime())[0]?.value).toBe(
      '15 May',
    )
  })

  it('is empty when the sport has no activity', () => {
    expect(formRows([makeActivity({ id: 'c', sport: 'ride' })], 'run', 'metric', NOW)).toEqual([])
  })
})
