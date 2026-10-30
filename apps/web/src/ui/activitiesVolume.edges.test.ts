import { COMPRESS_AFTER_WEEKS } from '@rca/core/digest/trendSeries'
import { describe, expect, it } from 'vitest'
import { makeActivity } from './components/fixtures'
import {
  bucketSpan,
  countOf,
  emptyTotals,
  inBucket,
  volumeBuckets,
  volumeColumns,
} from './activitiesVolume'
import type { VolumeBucket } from './activitiesVolume'

/** A local date and hour, so these edges do not depend on the zone running them. */
const at = (year: number, month: number, day: number, hour = 8) =>
  new Date(year, month, day, hour).getTime()
const WEEK_MS = 7 * 86_400_000

describe('a bucket is half open: its first instant is in, its end is the next bucket', () => {
  it('keeps an activity at the exact end of a week out of that week', () => {
    const key = 'w:2026-0-5' // Monday 5 January 2026, local
    const span = bucketSpan(key)!
    const items = [{ startMs: span.startMs }, { startMs: span.endMs - 1 }, { startMs: span.endMs }]
    expect(inBucket(items, key)).toEqual(items.slice(0, 2))
  })

  it('counts the newest activity when it starts at the first instant of a week', () => {
    const monday = new Date(2026, 0, 5).getTime()
    const buckets = volumeBuckets([
      makeActivity({ id: 'old', sport: 'run', startMs: at(2026, 0, 1) }),
      makeActivity({ id: 'new', sport: 'run', startMs: monday }),
    ])
    expect(buckets.reduce((sum, bucket) => sum + countOf(bucket.totals), 0)).toBe(2)
  })
})

describe('a quiet stretch folds into one gap at exactly the compress threshold', () => {
  const bucket = (week: number, active: boolean): VolumeBucket => {
    const totals = emptyTotals()
    if (active) totals.run.count = 1
    return {
      key: `w:${week}`,
      kind: 'week',
      startMs: week * WEEK_MS,
      endMs: (week + 1) * WEEK_MS,
      totals,
    }
  }
  const quiet = (weeks: number) => Array.from({ length: weeks }, (_, i) => bucket(i + 1, false))
  const kinds = (weeks: number) =>
    volumeColumns([bucket(0, true), ...quiet(weeks), bucket(weeks + 1, true)]).map(
      (column) => column.kind,
    )

  it('folds exactly COMPRESS_AFTER_WEEKS quiet weeks', () => {
    expect(kinds(COMPRESS_AFTER_WEEKS)).toEqual(['bucket', 'gap', 'bucket'])
  })

  it('keeps one week fewer as empty columns', () => {
    expect(kinds(COMPRESS_AFTER_WEEKS - 1)).toHaveLength(COMPRESS_AFTER_WEEKS + 1)
    expect(kinds(COMPRESS_AFTER_WEEKS - 1)).not.toContain('gap')
  })
})
