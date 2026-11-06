import type { LiftSet } from '@rca/core/lift'

/** A synthetic set: one lift on one date, so `setOrder` alone tells sets apart. */
export const make = (setOrder: number, loadKg = 60): LiftSet => ({
  date: '2031-01-05',
  exercise: 'squat',
  equipment: 'barbell',
  setOrder,
  reps: 5,
  loadKg,
})
