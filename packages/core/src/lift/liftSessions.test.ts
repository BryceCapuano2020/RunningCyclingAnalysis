import { describe, expect, it } from 'vitest'
import {
  liftSessionsOf,
  MEASURED_MAX_SECONDS,
  MEASURED_MIN_SECONDS,
  WARMUP_SET_SECONDS,
  WORKING_SET_SECONDS,
} from './liftSessions'
import type { LiftSet, TimePrecision } from './types'

const set = (date: string, setOrder: number, warmup?: true): LiftSet => ({
  date,
  exercise: 'squat',
  equipment: 'barbell',
  setOrder,
  reps: 5,
  loadKg: 100,
  ...(warmup === undefined ? {} : { warmup }),
})

/** A set stamped at a time of day, live by default. */
const at = (time: string, setOrder: number, timePrecision: TimePrecision = 'set'): LiftSet => ({
  ...set('2026-03-02', setOrder),
  time,
  timePrecision,
})

describe('liftSessionsOf', () => {
  it('is empty for no sets', () => {
    expect(liftSessionsOf([])).toEqual([])
  })

  it('makes one entry per day, oldest first, with sets counted', () => {
    const sessions = liftSessionsOf([
      set('2026-03-05', 1),
      set('2026-03-02', 1),
      set('2026-03-05', 2),
    ])
    expect(sessions.map((s) => [s.date, s.sets])).toEqual([
      ['2026-03-02', 1],
      ['2026-03-05', 2],
    ])
  })

  it('estimates 180 s a working set and 120 s a warm-up set', () => {
    expect(WORKING_SET_SECONDS).toBe(180)
    expect(WARMUP_SET_SECONDS).toBe(120)
    const [session] = liftSessionsOf([
      set('2026-03-02', 1, true),
      set('2026-03-02', 2),
      set('2026-03-02', 3),
    ])
    expect(session).toEqual({
      date: '2026-03-02',
      sets: 3,
      seconds: 120 + 180 + 180,
      measured: false,
    })
  })
})

describe('liftSessionsOf, measured time', () => {
  it('reads live stamps as first to last plus one set, in any order, and keeps the first stamp', () => {
    const [session] = liftSessionsOf([at('10:40', 3), at('10:00', 1), at('10:20', 2)])
    expect(session).toEqual({
      date: '2026-03-02',
      sets: 3,
      seconds: 40 * 60 + WORKING_SET_SECONDS,
      measured: true,
      start: '10:00',
    })
  })

  it('adds a warm-up allowance when the last stamped set is a warm-up', () => {
    const last = { ...at('09:30', 2), warmup: true as const }
    expect(liftSessionsOf([at('09:00', 1), last])[0]?.seconds).toBe(30 * 60 + WARMUP_SET_SECONDS)
  })

  it('takes a span from 5 min up to 3 h, both ends included', () => {
    expect(MEASURED_MIN_SECONDS).toBe(5 * 60)
    expect(MEASURED_MAX_SECONDS).toBe(3 * 60 * 60)
    expect(liftSessionsOf([at('10:00', 1), at('10:05', 2)])[0]?.measured).toBe(true)
    expect(liftSessionsOf([at('10:00', 1), at('13:00', 2)])[0]?.measured).toBe(true)
  })

  it('estimates a span under 5 min, which is sets entered one after another after the session', () => {
    const [session] = liftSessionsOf([at('10:00', 1), at('10:04', 2), at('10:04', 3)])
    expect(session).toMatchObject({ measured: false, seconds: 3 * WORKING_SET_SECONDS })
  })

  it('estimates a span over 3 h, or one set alone', () => {
    expect(liftSessionsOf([at('08:00', 1), at('11:01', 2)])[0]?.measured).toBe(false)
    expect(liftSessionsOf([at('08:00', 1)])[0]).toMatchObject({
      measured: false,
      seconds: WORKING_SET_SECONDS,
    })
  })

  it('estimates a day with a set that was not stamped live', () => {
    const imported = liftSessionsOf([at('10:00', 1, 'session'), at('10:00', 2, 'session')])
    expect(imported[0]).toMatchObject({ measured: false, start: '10:00' })
    const mixed = liftSessionsOf([at('10:00', 1), at('10:30', 2), set('2026-03-02', 3)])
    expect(mixed[0]).toMatchObject({ measured: false, seconds: 3 * WORKING_SET_SECONDS })
    const half = liftSessionsOf([at('10:00', 1), at('10:30', 2, 'session')])
    expect(half[0]?.measured).toBe(false)
  })

  it('gives no start to a day with no stamp, and reads each day on its own', () => {
    const sessions = liftSessionsOf([
      set('2026-03-01', 1),
      at('10:00', 1),
      at('10:45', 2),
      { ...at('12:00', 1), date: '2026-03-03' },
    ])
    expect(sessions.map((s) => [s.date, s.measured, s.start])).toEqual([
      ['2026-03-01', false, undefined],
      ['2026-03-02', true, '10:00'],
      ['2026-03-03', false, '12:00'],
    ])
    expect(sessions[0]).not.toHaveProperty('start')
  })

  it('ignores a time that is not a clock time', () => {
    const [session] = liftSessionsOf([at('10:00', 1), at('25:30', 2)])
    expect(session).toMatchObject({ measured: false, start: '10:00' })
  })
})
