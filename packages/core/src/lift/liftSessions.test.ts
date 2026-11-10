import { describe, expect, it } from 'vitest'
import { liftSessionsOf, WARMUP_SET_SECONDS, WORKING_SET_SECONDS } from './liftSessions'
import type { LiftSet } from './types'

const set = (date: string, setOrder: number, warmup?: true): LiftSet => ({
  date,
  exercise: 'squat',
  equipment: 'barbell',
  setOrder,
  reps: 5,
  loadKg: 100,
  ...(warmup === undefined ? {} : { warmup }),
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
    expect(session).toEqual({ date: '2026-03-02', sets: 3, seconds: 120 + 180 + 180 })
  })
})
