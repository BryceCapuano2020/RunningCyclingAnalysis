import { describe, expect, it } from 'vitest'
import type { SavedActivity } from '../../worker/protocol'
import { savedSummary } from './savedSummary'

function saved(
  id: string,
  sport: 'run' | 'ride',
  year: number,
  month: number,
  day = 12,
): SavedActivity {
  return {
    id,
    name: `Activity ${id}`,
    startMs: new Date(year, month, day, 12).getTime(),
    sport,
    copy: { id, rank: 3, hasPower: false, hasHeartRate: true, durationS: 3600 },
  }
}

describe('savedSummary', () => {
  it('counts each sport, runs first, and names the months the library spans', () => {
    expect(
      savedSummary([
        saved('a', 'ride', 2024, 4),
        saved('b', 'run', 2019, 0),
        saved('c', 'run', 2026, 9),
      ]),
    ).toBe('2 runs and 1 ride, from Jan 2019 to Oct 2026')
  })

  it('leaves out a sport with none, and names one month once', () => {
    expect(savedSummary([saved('a', 'ride', 2026, 9, 3), saved('b', 'ride', 2026, 9, 20)])).toBe(
      '2 rides, Oct 2026',
    )
  })

  it('counts a workout saved twice once, as the Activities list does', () => {
    expect(
      savedSummary([
        saved('a', 'run', 2026, 9),
        saved('a-copy', 'run', 2026, 9),
        saved('b', 'ride', 2026, 9),
      ]),
    ).toBe('1 run and 1 ride, Oct 2026')
  })
})
