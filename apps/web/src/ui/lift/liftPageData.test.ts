import { describe, expect, it } from 'vitest'
import type { LiftSet } from '@rca/core/lift'
import type { LoggedDay } from './liftDays'
import { earlierDays, lastSetOf, liftsOfDay, setOfKey } from './liftPageData'

const set = (over: Partial<LiftSet> = {}): LiftSet => ({
  date: '2031-01-05',
  exercise: 'back-squat',
  equipment: 'barbell',
  setOrder: 1,
  reps: 5,
  loadKg: 100,
  ...over,
})
const day = (date: string, ...sets: LiftSet[]): LoggedDay => ({
  date,
  lifts: sets.map((s) => ({
    key: `${s.exercise}.${s.equipment}` as never,
    exercise: s.exercise,
    equipment: s.equipment,
    sets: [{ key: `${date}|${s.setOrder}`, set: { ...s, date }, state: 'put' }],
  })),
})

describe('liftsOfDay', () => {
  it('names the lift, keeps the equipment and carries effort and warm-up only when set', () => {
    const [lift] = liftsOfDay(day('2031-01-05', set({ rpe: 8 }), set({ setOrder: 2 })))
    expect(lift?.name).toBe('Back squat')
    expect(lift?.sets[0]).toEqual({ key: '2031-01-05|1', reps: 5, loadKg: 100, rpe: 8 })
    expect(liftsOfDay(undefined)).toEqual([])
  })
})

describe('earlierDays', () => {
  const days = Array.from({ length: 14 }, (_, i) =>
    day(`2030-12-${String(30 - i).padStart(2, '0')}`, set()),
  )
  it('shows 12 days with no more at exactly 12, and more at 13', () => {
    expect(earlierDays(days.slice(0, 12), '2031-01-05', 12)).toMatchObject({ more: false })
    expect(earlierDays(days.slice(0, 12), '2031-01-05', 12).shown).toHaveLength(12)
    const thirteen = earlierDays(days.slice(0, 13), '2031-01-05', 12)
    expect(thirteen.shown).toHaveLength(12)
    expect(thirteen.more).toBe(true)
    expect(earlierDays(days.slice(0, 13), '2031-01-05', 24).more).toBe(false)
  })
  it('leaves out the day shown and later days, and lists each lift once', () => {
    const list = [
      day('2031-01-06', set()),
      day('2031-01-05', set()),
      day('2031-01-04', set(), set({ setOrder: 2 })),
    ]
    const { shown } = earlierDays(list, '2031-01-05', 12)
    expect(shown).toEqual([{ day: '2031-01-04', lifts: ['Back squat'] }])
  })
})

describe('setOfKey and lastSetOf', () => {
  it('finds a set by its key on the day shown', () => {
    const d = day('2031-01-05', set({ reps: 7 }))
    expect(setOfKey(d, '2031-01-05|1')?.reps).toBe(7)
    expect(setOfKey(d, 'nope')).toBeUndefined()
  })
  it('takes the newest day with the lift, matching equipment when given', () => {
    const days = [
      day('2031-01-04', set({ equipment: 'dumbbell', reps: 9 })),
      day('2031-01-03', set({ reps: 3 })),
    ]
    expect(lastSetOf(days, 'back-squat', undefined)?.reps).toBe(9)
    expect(lastSetOf(days, 'back-squat', 'barbell')?.reps).toBe(3)
    expect(lastSetOf(days, 'deadlift', undefined)).toBeUndefined()
  })
})
