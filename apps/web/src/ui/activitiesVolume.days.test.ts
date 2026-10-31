import { afterEach, describe, expect, it, vi } from 'vitest'
import { localDayOf, setViewerZone, UTC_ZONE, withLocalWeeks } from '@rca/core/calendar'
import { makeActivity } from './components/fixtures'
import { bucketLabel, bucketSpan, inBucket, monthTotals, volumeBuckets } from './activitiesVolume'
import { sampleProfileAt } from './sampleAthlete'
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

describe('with local weeks on', () => {
  // Sunday 8 March 2026, 18:00 at UTC-8 (PST): Monday 9 March 02:00 UTC, the day before DST starts at 10:00 UTC.
  const sundayEvening = at(2026, 3, 9, 2)
  const mondayMorning = at(2026, 3, 9, 16)
  const nextSunday = at(2026, 3, 16, 3)

  it('counts a Sunday evening in its own local week, by the file’s shift', () => {
    withLocalWeeks(true, () => {
      const buckets = volumeBuckets([
        run(sundayEvening, -1),
        run(mondayMorning, 0),
        run(nextSunday, -1),
      ])
      expect(buckets.map((b) => b.key)).toEqual(['w:2026-2-2', 'w:2026-2-9'])
      expect(buckets.map((b) => b.totals.run.count)).toEqual([1, 2])
    })
  })

  it('counts by the viewer’s zone where a file gave no shift, across a daylight saving change', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    setViewerZone(deviceZone)
    withLocalWeeks(true, () => {
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
    })
  })

  it('names the same keys with it off, in the device’s zone', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    const items = [run(sundayEvening), run(mondayMorning)]
    expect(volumeBuckets(items).map((b) => b.key)).toEqual(['w:2026-2-2', 'w:2026-2-9'])
    withLocalWeeks(true, () => {
      setViewerZone(deviceZone)
      expect(volumeBuckets(items).map((b) => b.key)).toEqual(['w:2026-2-2', 'w:2026-2-9'])
    })
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
