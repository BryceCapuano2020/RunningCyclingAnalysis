import { describe, expect, it } from 'vitest'
import { makeActivity } from './components/fixtures'
import {
  WEEKLY_MAX_WEEKS,
  bucketLabel,
  bucketSpan,
  countOf,
  countsText,
  formatHoursText,
  inBucket,
  monthKeyOf,
  monthTotals,
  secondsOf,
  volumeBuckets,
} from './activitiesVolume'

/** A local date and hour, so the weeks and months these tests count do not depend on the zone running them. */
const at = (year: number, month: number, day: number, hour = 8) =>
  new Date(year, month, day, hour).getTime()

const run = (startMs: number, durationS = 3600, distanceM = 10000) =>
  makeActivity({ id: `run-${startMs}`, sport: 'run', startMs, durationS, distanceM })
const ride = (startMs: number, durationS = 3600, distanceM = 30000) =>
  makeActivity({ id: `ride-${startMs}`, sport: 'ride', startMs, durationS, distanceM })

describe('volumeBuckets', () => {
  it('is empty for no activities', () => {
    expect(volumeBuckets([])).toEqual([])
  })

  it('sums hours, counts and distance by sport in each local week, Monday to Sunday', () => {
    // Mon 2 Jun 2025 is a Monday. Sun 8 Jun still belongs to that week; Mon 9 Jun starts the next.
    const buckets = volumeBuckets([
      run(at(2025, 5, 2), 3600),
      ride(at(2025, 5, 8, 23), 7200, 50000),
      run(at(2025, 5, 9), 1800),
    ])
    expect(buckets.map((bucket) => bucket.kind)).toEqual(['week', 'week'])
    expect(buckets[0]?.startMs).toBe(at(2025, 5, 2, 0))
    expect(buckets[0]?.totals.run).toEqual({ count: 1, seconds: 3600, distanceM: 10000 })
    expect(buckets[0]?.totals.ride).toEqual({ count: 1, seconds: 7200, distanceM: 50000 })
    expect(buckets[1]?.startMs).toBe(at(2025, 5, 9, 0))
    expect(buckets[1]?.totals.run.seconds).toBe(1800)
    expect(countOf(buckets[0]!.totals)).toBe(2)
    expect(secondsOf(buckets[0]!.totals)).toBe(10800)
  })

  it('times an activity by its moving time when it is kept', () => {
    const [bucket] = volumeBuckets([
      makeActivity({ startMs: at(2025, 5, 3), durationS: 3600, movingS: 3000 }),
    ])
    expect(bucket?.totals.run.seconds).toBe(3000)
  })

  it('keeps a week with no training as an empty column, so the axis is true to time', () => {
    const buckets = volumeBuckets([run(at(2025, 5, 2)), run(at(2025, 5, 23))])
    expect(buckets.map((bucket) => countOf(bucket.totals))).toEqual([1, 0, 0, 1])
  })

  it('draws a set of up to 26 weeks by the week', () => {
    const first = at(2025, 0, 6)
    const last = first + (WEEKLY_MAX_WEEKS - 1) * 7 * 86_400_000
    const buckets = volumeBuckets([run(first), run(last)])
    expect(buckets.every((bucket) => bucket.kind === 'week')).toBe(true)
    expect(buckets).toHaveLength(WEEKLY_MAX_WEEKS)
  })

  it('draws a set longer than 26 weeks by the month, from the first month to the last', () => {
    const buckets = volumeBuckets([
      run(at(2024, 10, 20), 3600),
      ride(at(2025, 0, 15), 1800),
      run(at(2025, 5, 2), 600),
    ])
    expect(buckets.every((bucket) => bucket.kind === 'month')).toBe(true)
    expect(buckets.map((bucket) => bucket.key)).toEqual([
      'm:2024-10',
      'm:2024-11',
      'm:2025-0',
      'm:2025-1',
      'm:2025-2',
      'm:2025-3',
      'm:2025-4',
      'm:2025-5',
    ])
    expect(buckets[0]?.startMs).toBe(at(2024, 10, 1, 0))
    expect(buckets[0]?.endMs).toBe(at(2024, 11, 1, 0))
    expect(buckets[2]?.totals.ride.seconds).toBe(1800)
    expect(buckets[7]?.totals.run.seconds).toBe(600)
    expect(buckets[4] && countOf(buckets[4].totals)).toBe(0)
  })

  it('counts every activity once, in whichever grain it draws', () => {
    const many = Array.from({ length: 400 }, (_, i) => run(at(2023, 0, 1) + i * 86_400_000 * 2))
    const buckets = volumeBuckets(many)
    expect(buckets.reduce((sum, bucket) => sum + countOf(bucket.totals), 0)).toBe(400)
  })
})

describe('bucket keys', () => {
  it('names the span a week or month key stands for', () => {
    const week = bucketSpan('w:2025-5-2')
    expect(week).toEqual({ kind: 'week', startMs: at(2025, 5, 2, 0), endMs: at(2025, 5, 9, 0) })
    const month = bucketSpan('m:2025-11')
    expect(month).toEqual({ kind: 'month', startMs: at(2025, 11, 1, 0), endMs: at(2026, 0, 1, 0) })
  })

  it('refuses a key the strip could not have made', () => {
    for (const bad of [
      '',
      'w:',
      'w:2025-5',
      'w:a-b-c',
      'm:2025-12',
      'm:2025',
      'month',
      'w:1-2-3-4',
    ]) {
      expect(bucketSpan(bad)).toBeNull()
    }
  })

  it('narrows a list to the span a key names, and leaves it whole without one', () => {
    const items = [
      run(at(2025, 5, 1)),
      run(at(2025, 5, 2)),
      run(at(2025, 5, 9)),
      run(at(2025, 6, 1)),
    ]
    expect(inBucket(items, 'w:2025-5-2')).toEqual([items[1]])
    expect(inBucket(items, 'm:2025-5')).toEqual(items.slice(0, 3))
    expect(inBucket(items, null)).toBe(items)
    expect(inBucket(items, 'junk')).toBe(items)
  })

  it('labels a week by its Monday and a month by its name, each with the year', () => {
    expect(bucketLabel({ kind: 'week', startMs: at(2025, 5, 2, 0) })).toBe('week of 2 Jun 2025')
    expect(bucketLabel({ kind: 'month', startMs: at(2025, 5, 1, 0) })).toBe('Jun 2025')
  })
})

describe('month totals', () => {
  it('sums the count, time and distance of each sport for each month listed', () => {
    const totals = monthTotals([
      run(at(2025, 5, 2), 3600, 10000),
      run(at(2025, 5, 20), 1800, 5000),
      ride(at(2025, 5, 21), 7200, 60000),
      run(at(2025, 4, 30), 600, 2000),
    ])
    const june = totals.get(monthKeyOf(at(2025, 5, 1)))
    expect(june?.run).toEqual({ count: 2, seconds: 5400, distanceM: 15000 })
    expect(june?.ride).toEqual({ count: 1, seconds: 7200, distanceM: 60000 })
    expect(totals.get(monthKeyOf(at(2025, 4, 1)))?.run.count).toBe(1)
    expect(totals.size).toBe(2)
  })
})

describe('text', () => {
  it('writes hours with a decimal under ten and whole above', () => {
    expect(formatHoursText(3.24 * 3600)).toBe('3.2 h')
    expect(formatHoursText(61.4 * 3600)).toBe('61 h')
    expect(formatHoursText(1204 * 3600)).toBe('1,204 h')
  })

  it('counts each sport that has activities, in the order sports sit', () => {
    const [bucket] = volumeBuckets([run(at(2025, 5, 2)), run(at(2025, 5, 3)), ride(at(2025, 5, 4))])
    expect(countsText(bucket!.totals)).toBe('2 runs and 1 ride')
    const [runsOnly] = volumeBuckets([run(at(2025, 5, 2))])
    expect(countsText(runsOnly!.totals)).toBe('1 run')
  })
})
