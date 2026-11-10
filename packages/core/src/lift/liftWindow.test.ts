import { describe, expect, it } from 'vitest'
import { liftWindowCounts } from './liftWindow'
import type { LiftSet } from './types'

const set = (date: string, order: number, extra: Partial<LiftSet> = {}): LiftSet => ({
  date,
  exercise: 'back-squat',
  equipment: 'barbell',
  setOrder: order,
  reps: 5,
  loadKg: 100,
  ...extra,
})

describe('liftWindowCounts', () => {
  it('counts working sets, sessions and rated sessions in the 56 days to the date', () => {
    const sets = [
      set('2030-03-01', 1, { rpe: 8 }),
      set('2030-03-01', 2),
      set('2030-03-01', 3, { warmup: true, rpe: 5 }),
      set('2030-03-05', 1),
      set('2030-01-05', 1, { rpe: 9 }), // 55 days before the end: inside
      set('2030-01-04', 1, { rpe: 9 }), // 56 days before: outside
      set('2030-03-06', 1, { rpe: 9 }), // after the date
    ]
    expect(liftWindowCounts(sets, '2030-03-01')).toEqual({ sets: 3, sessions: 2, ratedSessions: 2 })
    expect(liftWindowCounts(sets, '2030-03-05')).toEqual({ sets: 3, sessions: 2, ratedSessions: 1 })
  })

  it('is empty for a lift not trained in the window', () => {
    expect(liftWindowCounts([set('2029-01-01', 1)], '2030-03-01')).toEqual({
      sets: 0,
      sessions: 0,
      ratedSessions: 0,
    })
  })
})
