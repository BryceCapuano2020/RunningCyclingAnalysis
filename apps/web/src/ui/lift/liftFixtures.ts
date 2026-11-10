import type { LiftSet } from '@rca/core/lift'

/** A synthetic back squat: one set of reps at a load on a date, rated RPE 8 unless told otherwise. */
export function squat(date: string, loadKg: number, over: Partial<LiftSet> = {}): LiftSet {
  return {
    date,
    exercise: 'back-squat',
    equipment: 'barbell',
    setOrder: 1,
    reps: 5,
    loadKg,
    rpe: 8,
    ...over,
  }
}

/** Squats every fourth day for nine weeks, rising by 1 kg a session, from 100 kg: a synthetic lifter. */
export function risingSquats(): LiftSet[] {
  return Array.from({ length: 16 }, (_, i) => {
    const day = new Date(Date.UTC(2031, 0, 1 + i * 4))
    return squat(day.toISOString().slice(0, 10), 100 + i)
  })
}

export const LAST_SQUAT_DAY = '2031-03-02'
