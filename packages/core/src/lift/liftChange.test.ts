import { describe, expect, it } from 'vitest'
import { liftChange, liftChangeDetail } from './liftChange'
import type { LiftSet } from './types'

let order = 0
const set = (over: Partial<LiftSet> = {}): LiftSet => ({
  date: '2025-03-03',
  exercise: 'back-squat',
  equipment: 'barbell',
  setOrder: ++order,
  reps: 5,
  loadKg: 100,
  rpe: 8,
  ...over,
})

// Periods of 28 days ending 2025-04-28; the previous one ends 2025-03-31.
const END = '2025-04-28'

describe('liftChange', () => {
  it('is null when either side has no estimate', () => {
    expect(liftChange([], END, 28)).toBeNull()
    // Nothing in the previous period.
    expect(liftChange([set({ date: '2025-04-10' })], END, 28)).toBeNull()
    // Nothing on or before the end.
    expect(liftChange([set({ date: '2025-05-10' })], END, 28)).toBeNull()
  })

  it('is no clear change for a small step: 5% on the same reps is inside the unshared error', () => {
    // Same reps, so the systematic terms cancel; each period's day error alone is 0.042 (RPE noise on top).
    const sets = [set({ date: '2025-03-25' }), set({ date: '2025-04-25', loadKg: 105 })]
    const r = liftChangeDetail(sets, END, 28)!
    expect(r.change).toBe('no clear change')
    expect(r.now.terms).toEqual(r.before.terms)
  })

  it('is null for an untrained period: the older session is not carried into it', () => {
    expect(liftChange([set({ date: '2025-03-25' })], END, 28)).toBeNull()
  })

  it('reads each period from its own sessions: a heavy session before the cut does not reach the later period', () => {
    // 02-20 is in the period before the previous one, so the previous period has no session.
    const sets = [set({ date: '2025-02-20', loadKg: 150 }), set({ date: '2025-04-25' })]
    expect(liftChange(sets, END, 28)).toBeNull()
  })

  it('is up when the load moves well past the unshared error', () => {
    // Same reps, so the terms cancel: ln(150 / 100) = 0.405 against 2.24 x hypot(0.049, 0.049) = 0.155.
    const sets = [set({ date: '2025-03-25' }), set({ date: '2025-04-25', loadKg: 150 })]
    const r = liftChangeDetail(sets, END, 28)!
    expect(r.change).toBe('up')
  })

  it('is down when it falls the same way', () => {
    const sets = [set({ date: '2025-03-25', loadKg: 150 }), set({ date: '2025-04-25' })]
    expect(liftChange(sets, END, 28)).toBe('down')
  })

  it('names nothing when the reps moved by more than 3: the curve error is not shared', () => {
    // 100 kg for 5 at RPE 8 reads R 7.5; for 12 it reads R 14.5, a difference of 7.
    const sets = [set({ date: '2025-03-25' }), set({ date: '2025-04-25', reps: 12, loadKg: 150 })]
    const r = liftChangeDetail(sets, END, 28)!
    expect(Math.abs(r.now.meanR - r.before.meanR)).toBeGreaterThan(3)
    expect(r.change).toBe('no clear change')
  })

  it('names nothing when the clamped figures contradict the direction', () => {
    // The earlier period lifted 200 kg at RPE 5 (not read, but the floor): its figure is clamped to 200,
    // above the later period's unclamped 183, though the estimates before the clamp rose.
    const sets = [
      set({ date: '2025-03-25' }),
      set({ date: '2025-03-25', loadKg: 200, reps: 1, rpe: 5 }),
      set({ date: '2025-04-25', loadKg: 150 }),
    ]
    const r = liftChangeDetail(sets, END, 28)!
    expect(r.now.point0).toBeGreaterThan(r.before.point0)
    expect(r.now.point).toBeLessThan(r.before.point)
    expect(r.change).toBe('no clear change')
  })
})
