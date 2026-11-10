import { describe, expect, it } from 'vitest'
import { liftChange } from './liftChange'
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

  it('is no clear change when the ranges overlap: a small step up', () => {
    const sets = [set({ date: '2025-03-25' }), set({ date: '2025-04-25', loadKg: 105 })]
    const r = liftChange(sets, END, 28)!
    expect(r.change).toBe('no clear change')
    expect(r.now.low).toBeLessThan(r.before.high)
  })

  it('is null for an untrained period: the older session is not carried into it', () => {
    expect(liftChange([set({ date: '2025-03-25' })], END, 28)).toBeNull()
  })

  it('reads each period from its own sessions: a heavy session before the cut does not reach the later period', () => {
    // 02-20 is in the period before the previous one, so the previous period has no session.
    const sets = [set({ date: '2025-02-20', loadKg: 150 }), set({ date: '2025-04-25' })]
    expect(liftChange(sets, END, 28)).toBeNull()
  })

  it('is up when the end range sits wholly above the earlier one', () => {
    // 100 kg x 5 at RPE 8 reads 111.7 to 138.4; 150 kg x 5 reads 167.6 to 207.6.
    const sets = [set({ date: '2025-03-25' }), set({ date: '2025-04-25', loadKg: 150 })]
    const r = liftChange(sets, END, 28)!
    expect(r.change).toBe('up')
    expect(r.now.low).toBeGreaterThan(r.before.high)
  })

  it('is down when the end range sits wholly below the earlier one', () => {
    const sets = [set({ date: '2025-03-25', loadKg: 150 }), set({ date: '2025-04-25' })]
    const r = liftChange(sets, END, 28)!
    expect(r.change).toBe('down')
    expect(r.now.high).toBeLessThan(r.before.low)
  })
})
