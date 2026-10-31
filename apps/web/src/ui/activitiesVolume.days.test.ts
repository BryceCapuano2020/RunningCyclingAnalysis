import { afterEach, describe, expect, it, vi } from 'vitest'
import { localDayOf, setViewerZone, UTC_ZONE } from '@rca/core/calendar'
import { makeActivity } from './components/fixtures'
import { bucketLabel, bucketSpan, inBucket, monthTotals, volumeBuckets } from './activitiesVolume'
import { sampleProfileAt } from './sampleAthlete'
import { groupByMonth } from './activitySort'
import { periodWeekEnds } from './charts/periodWeeks'
import { deviceZone } from '../worker/viewerZone'

/**
 * The Activities list's weeks, months and years are the calendar's days: an activity is in the column of its
 * local day (the shift its file recorded), and the same bucket is named by the same key whichever zone runs it.
 */
afterEach(() => {
  vi.unstubAllEnvs()
  setViewerZone(UTC_ZONE)
})

const at = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min)
const run = (startMs: number, localDayShift?: -1 | 0 | 1) =>
  makeActivity({
    id: `run-${startMs}`,
    sport: 'run',
    startMs,
    ...(localDayShift === undefined ? {} : { localDayShift }),
  })

describe('the weeks of a library, in the viewer’s zone', () => {
  // Sunday 8 March 2026, 18:00 at UTC-8 (PST): Monday 9 March 02:00 UTC, the day before DST starts at 10:00 UTC.
  const sundayEvening = at(2026, 3, 9, 2)
  const mondayMorning = at(2026, 3, 9, 16)
  const nextSunday = at(2026, 3, 16, 3)

  it('counts a Sunday evening in its own local week, by the file’s shift', () => {
    {
      const buckets = volumeBuckets([
        run(sundayEvening, -1),
        run(mondayMorning, 0),
        run(nextSunday, -1),
      ])
      expect(buckets.map((b) => b.key)).toEqual(['w:2026-2-2', 'w:2026-2-9'])
      expect(buckets.map((b) => b.totals.run.count)).toEqual([1, 2])
    }
  })

  it('counts by the viewer’s zone where a file gave no shift, across a daylight saving change', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    setViewerZone(deviceZone)
    {
      const items = [run(sundayEvening), run(mondayMorning), run(at(2026, 3, 9, 6, 59))]
      expect(items.map(localDayOf)).toEqual([
        Math.floor(at(2026, 3, 8) / 86_400_000),
        Math.floor(at(2026, 3, 9) / 86_400_000),
        Math.floor(at(2026, 3, 8) / 86_400_000),
      ])
      // The week that holds the DST change runs from local Monday 2 March to the next, 167 hours long.
      const span = bucketSpan('w:2026-2-2')!
      expect(span.startMs).toBe(at(2026, 3, 2, 8))
      expect(span.endMs).toBe(at(2026, 3, 9, 7))
      expect(inBucket(items, 'w:2026-2-2')).toEqual([items[0], items[2]])
      expect(inBucket(items, 'w:2026-2-9')).toEqual([items[1]])
      expect(monthTotals(items).get('2026-2')?.run.count).toBe(3)
      expect(bucketLabel({ kind: 'month', startMs: span.startMs })).toMatch(/Mar/)
    }
  })
})

describe('the sample athlete’s year', () => {
  it('is the year of the newest effort in the zone it is read in', () => {
    // 1 January 2027, 02:00 UTC is still 31 December 2026 in Los Angeles.
    const newestMs = at(2027, 1, 1, 2)
    vi.stubEnv('TZ', 'America/Los_Angeles')
    expect(sampleProfileAt(newestMs).birthYear).toBe(2026 - 37)
    vi.stubEnv('TZ', 'UTC')
    expect(sampleProfileAt(newestMs).birthYear).toBe(2027 - 37)
  })
})

describe('the list under its headings and the hours under the trend', () => {
  it('puts a row under the month of its local day, as the month totals count it', () => {
    // 1 April 2026, 02:00 UTC was still 31 March where the file was recorded.
    const late = run(at(2026, 4, 1, 2), -1)
    const early = run(at(2026, 4, 1, 12), 0)
    setViewerZone(deviceZone)
    {
      const groups = groupByMonth([late, early])
      expect(groups.map((g) => g.items.length)).toEqual([1, 1])
      expect(groups[0]!.key).toBe([...monthTotals([late]).keys()][0])
      expect(groups[0]!.label).toMatch(/Mar/)
      expect(groups[1]!.label).toMatch(/Apr/)
    }
  })

  it('starts the hours at the week of the period’s first local day', () => {
    // Monday 9 March, 02:00 UTC is Sunday evening at UTC-7: the week before.
    const sundayEnd = at(2026, 3, 9) - 1
    const trendEnds = [sundayEnd + 7 * 86_400_000]
    {
      setViewerZone(() => -7 * 60)
      expect(periodWeekEnds(trendEnds, at(2026, 3, 9, 2))).toEqual([
        sundayEnd,
        sundayEnd + 7 * 86_400_000,
      ])
    }
    expect(periodWeekEnds(trendEnds, at(2026, 3, 9, 2))).toEqual(trendEnds)
  })
})
