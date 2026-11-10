import { describe, expect, it } from 'vitest'
import '../test/deviceZone'
import { dayOfCivil } from '@rca/core/calendar'
import type { LiftSet } from '@rca/core/lift'
import { makeActivity } from './components/test/fixtures'
import { liftDaysInBucket, liftDaysInPeriod, liftDaysOf } from './activitiesLift'
import {
  activityCountOf,
  countOf,
  countsText,
  monthTotals,
  secondsOf,
  totalHoursText,
  VOLUME_KINDS,
  volumeBuckets,
  volumeColumns,
} from './activitiesVolume'

const at = (year: number, month: number, day: number) => new Date(year, month, day, 8).getTime()
const run = (startMs: number) =>
  makeActivity({ id: `run-${startMs}`, sport: 'run', startMs, durationS: 3600, distanceM: 10000 })
const liftOn = (year: number, month: number, date: number, seconds = 1800, measured = false) => ({
  day: dayOfCivil(year, month, date),
  seconds,
  measured,
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
    expect(bucket?.totals.lift).toEqual({
      count: 2,
      seconds: 2700,
      distanceM: 0,
      estimatedSeconds: 2700,
    })
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

  it('marks a total "~" only when it holds an estimated lifting day', () => {
    const measured = monthTotals([run(at(2025, 5, 2))], [liftOn(2025, 5, 9, 3600, true)])
    expect(measured.get('2025-5')?.lift).toEqual({ count: 1, seconds: 3600, distanceM: 0 })
    expect(totalHoursText(measured.get('2025-5')!)).toBe('2.0 h')
    const mixed = monthTotals([], [liftOn(2025, 5, 9, 3600, true), liftOn(2025, 5, 12, 1800)])
    expect(mixed.get('2025-5')?.lift.estimatedSeconds).toBe(1800)
    expect(totalHoursText(mixed.get('2025-5')!)).toBe('~1.5 h')
  })
})

describe('lifting days of the page', () => {
  const sets = (date: string, count: number, exercise = 'back-squat'): LiftSet[] =>
    Array.from({ length: count }, (_, index) => ({
      date,
      exercise,
      equipment: 'barbell' as const,
      setOrder: index + 1,
      reps: 5,
      loadKg: 60,
    }))
  const stamped = (time: string, setOrder: number): LiftSet => ({
    ...sets('2025-06-03', 1)[0]!,
    setOrder,
    time,
    timePrecision: 'set',
  })

  it('makes a day number and estimated seconds for each day with sets', () => {
    const days = liftDaysOf([...sets('2025-06-03', 2), ...sets('2025-06-05', 1)])
    expect(
      days.map(({ day, seconds, measured, sets }) => ({ day, seconds, measured, sets })),
    ).toEqual([
      { day: dayOfCivil(2025, 5, 3), seconds: 360, measured: false, sets: 2 },
      { day: dayOfCivil(2025, 5, 5), seconds: 180, measured: false, sets: 1 },
    ])
    expect(days[0]).toMatchObject({ date: '2025-06-03', timed: false, name: 'Back squat' })
    expect(days[0]?.startMs).toBe(new Date(2025, 5, 3).getTime())
  })

  it('takes measured seconds and the start from live stamps', () => {
    const [day] = liftDaysOf([stamped('17:30', 1), stamped('18:10', 2)])
    expect(day).toMatchObject({ seconds: 40 * 60 + 180, measured: true, timed: true })
    expect(day?.startMs).toBe(new Date(2025, 5, 3, 17, 30).getTime())
  })

  it('names the two lifts with most sets, then counts the rest', () => {
    const day = (...lifts: LiftSet[][]) => liftDaysOf(lifts.flat())[0]?.name
    expect(day(sets('2025-06-03', 2, 'back-squat'), sets('2025-06-03', 4, 'bench-press'))).toBe(
      'Bench press, back squat',
    )
    expect(
      day(
        sets('2025-06-03', 5, 'bench-press'),
        sets('2025-06-03', 3, 'incline-bench-press'),
        sets('2025-06-03', 2, 'back-squat'),
        sets('2025-06-03', 1, 'leg-press'),
      ),
    ).toBe('Bench press, incline bench press +2')
  })

  it('leaves out a date that is not a real day, rather than rolling it into another', () => {
    const days = liftDaysOf([
      ...sets('2025-13-45', 1),
      ...sets('2025-02-30', 1),
      ...sets('2025-6-3', 1),
      ...sets('2025-06-03', 1),
    ])
    expect(days.map(({ day, seconds }) => ({ day, seconds }))).toEqual([
      { day: dayOfCivil(2025, 5, 3), seconds: 180 },
    ])
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
