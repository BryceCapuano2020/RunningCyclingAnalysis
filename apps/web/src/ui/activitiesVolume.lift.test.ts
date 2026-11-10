import { describe, expect, it } from 'vitest'
import '../test/deviceZone'
import { dayOfCivil } from '@rca/core/calendar'
import { makeActivity } from './components/test/fixtures'
import { liftDaysInBucket, liftDaysInPeriod, liftDaysOf } from './activitiesLift'
import {
  activityCountOf,
  countOf,
  countsText,
  monthTotals,
  secondsOf,
  VOLUME_KINDS,
  volumeBuckets,
  volumeColumns,
} from './activitiesVolume'

const at = (year: number, month: number, day: number) => new Date(year, month, day, 8).getTime()
const run = (startMs: number) =>
  makeActivity({ id: `run-${startMs}`, sport: 'run', startMs, durationS: 3600, distanceM: 10000 })
const liftOn = (year: number, month: number, date: number, seconds = 1800) => ({
  day: dayOfCivil(year, month, date),
  seconds,
})

describe('volume kinds', () => {
  it('lists lifting after the sports', () => {
    expect(VOLUME_KINDS).toEqual(['run', 'ride', 'lift'])
  })
})

describe('volumeBuckets with lifting', () => {
  it('adds lifting days to their week: sessions as the count, seconds, no distance', () => {
    const [bucket] = volumeBuckets([run(at(2025, 5, 2))], false, [
      liftOn(2025, 5, 3),
      liftOn(2025, 5, 5, 900),
    ])
    expect(bucket?.totals.lift).toEqual({ count: 2, seconds: 2700, distanceM: 0 })
    expect(secondsOf(bucket!.totals)).toBe(3600 + 2700)
    expect(countOf(bucket!.totals)).toBe(3)
    expect(activityCountOf(bucket!.totals)).toBe(1)
  })

  it('draws a strip from lifting alone, and widens the range to lifting before and after the activities', () => {
    expect(volumeBuckets([], false, [liftOn(2025, 5, 3)])).toHaveLength(1)
    const buckets = volumeBuckets([run(at(2025, 5, 11))], false, [
      liftOn(2025, 5, 2),
      liftOn(2025, 5, 25),
    ])
    expect(buckets).toHaveLength(4)
    expect(buckets[0]?.totals.lift.count).toBe(1)
    expect(buckets[3]?.totals.lift.count).toBe(1)
  })

  it('counts a lifting day as training, so its week is not quiet and a year of none is still a gap', () => {
    const buckets = volumeBuckets([run(at(2024, 0, 8))], false, [liftOn(2025, 5, 3)])
    const columns = volumeColumns(buckets)
    expect(columns.some((column) => column.kind === 'gap')).toBe(true)
    expect(columns.at(-1)).toMatchObject({ kind: 'bucket' })
    const last = columns.at(-1)
    expect(last?.kind === 'bucket' ? countOf(last.bucket.totals) : null).toBe(1)
  })

  it('is unchanged with no lifting days', () => {
    const activities = [run(at(2025, 5, 2))]
    expect(volumeBuckets(activities, false, [])).toEqual(volumeBuckets(activities))
  })
})

describe('monthTotals and countsText with lifting', () => {
  it('adds lifting days to their month and names them', () => {
    const months = monthTotals([run(at(2025, 5, 2))], [liftOn(2025, 5, 9), liftOn(2025, 5, 12)])
    const june = months.get('2025-5')!
    expect(june.lift.count).toBe(2)
    expect(countsText(june)).toBe('1 run and 2 lifts')
    expect(countsText({ ...june, ride: { count: 3, seconds: 1, distanceM: 1 } })).toBe(
      '1 run, 3 rides and 2 lifts',
    )
  })

  it('makes a month for lifting alone', () => {
    expect(monthTotals([], [liftOn(2025, 6, 1)]).get('2025-6')?.lift.count).toBe(1)
  })
})

describe('lifting days of the page', () => {
  const sets = (date: string, count: number) =>
    Array.from({ length: count }, (_, index) => ({
      date,
      exercise: 'squat',
      equipment: 'barbell' as const,
      setOrder: index + 1,
      reps: 5,
      loadKg: 60,
    }))

  it('makes a day number and estimated seconds for each day with sets', () => {
    expect(liftDaysOf([...sets('2025-06-03', 2), ...sets('2025-06-05', 1)])).toEqual([
      { day: dayOfCivil(2025, 5, 3), seconds: 360 },
      { day: dayOfCivil(2025, 5, 5), seconds: 180 },
    ])
  })

  it('leaves out a date that is not a real day, rather than rolling it into another', () => {
    const days = liftDaysOf([
      ...sets('2025-13-45', 1),
      ...sets('2025-02-30', 1),
      ...sets('2025-6-3', 1),
      ...sets('2025-06-03', 1),
    ])
    expect(days).toEqual([{ day: dayOfCivil(2025, 5, 3), seconds: 180 }])
  })

  it('keeps the days in the period that ends on the newest activity, or all for all time', () => {
    const days = [liftOn(2025, 4, 1), liftOn(2025, 5, 3), liftOn(2025, 5, 20)]
    const newest = at(2025, 5, 10)
    expect(liftDaysInPeriod(days, null, newest)).toEqual(days)
    expect(liftDaysInPeriod(days, 30, newest)).toEqual([days[1]])
  })

  it('keeps the days in the picked bucket', () => {
    const days = [liftOn(2025, 5, 1), liftOn(2025, 5, 3), liftOn(2025, 5, 12)]
    expect(liftDaysInBucket(days, 'm:2025-5')).toEqual(days)
    expect(liftDaysInBucket(days, 'w:2025-5-2')).toEqual([days[1]])
    expect(liftDaysInBucket(days, null)).toEqual(days)
  })
})
