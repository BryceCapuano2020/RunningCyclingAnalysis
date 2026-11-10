import { describe, expect, it } from 'vitest'
import { medianEquation } from './equations'
import { checkVerdict, ownDataCheck, repsForOneRm, repsRangeAt } from './ownDataCheck'
import type { LiftSet } from './types'

let order = 0
const set = (over: Partial<LiftSet> = {}): LiftSet => ({
  date: '2025-03-03',
  exercise: 'back-squat',
  equipment: 'barbell',
  setOrder: ++order,
  reps: 5,
  loadKg: 100,
  rpe: 10,
  ...over,
})

/** `n` consecutive days from 2025-03-01 (March has 31), one set each, load from `loadOn`. */
const days = (n: number, loadOn: (i: number) => number): LiftSet[] =>
  Array.from({ length: n }, (_, i) =>
    set({ date: `2025-03-${String(i + 1).padStart(2, '0')}`, loadKg: loadOn(i) }),
  )

describe('repsForOneRm', () => {
  it('inverts the point equation: 100 kg is a 116.67 kg max at 5 reps (Epley is the median)', () => {
    expect(repsForOneRm(100, 350 / 3)).toBeCloseTo(5, 6)
    expect(repsForOneRm(100, medianEquation(100, 9.3))).toBeCloseTo(9.3, 6)
  })

  it('is 1 rep at or under the load, and caps out of reach', () => {
    expect(repsForOneRm(100, 100)).toBe(1)
    expect(repsForOneRm(100, 90)).toBe(1)
    expect(repsForOneRm(100, 1000)).toBe(36)
  })
})

describe('the check on a log you can read', () => {
  it('two days: 140 kg for 5 after a 100 kg set for 5 reads above, 100 kg again reads in', () => {
    // Day 1 alone gives point 116.67, sd 0.0691 (sys 0.0532, ind 0.0441), 0.0809 widened: high 131.7 kg.
    // At 140 kg that is under one rep, so 5 reps is above; 100 kg allows about 2 to 10 reps.
    const sets = [
      set({ date: '2025-03-01' }),
      set({ date: '2025-03-02', loadKg: 140 }),
      set({ date: '2025-03-02', loadKg: 100 }),
    ]
    const c = ownDataCheck(sets)
    expect(c).toMatchObject({ events: 2, inRange: 1, above: 1, below: 0, verdict: 'too-few' })
    expect(c.coverage).toBe(0.5)
  })

  it('a flat lifter is always in range: 34 events, every one in, so narrow', () => {
    const c = ownDataCheck(days(35, () => 100))
    expect(c).toMatchObject({ events: 34, inRange: 34, above: 0, below: 0, verdict: 'narrow' })
  })

  it('a lifter adding 4 kg a day outruns the estimate: most miss above, so widen', () => {
    const c = ownDataCheck(days(31, (i) => 100 + 4 * i))
    expect(c.events).toBe(30)
    expect(c.coverage).toBeLessThan(0.7)
    expect(c.above).toBeGreaterThan(c.below)
    expect(c.verdict).toBe('widen')
  })

  it('counts only working sets at RPE 9.5 or higher with an estimate before the day', () => {
    const sets = [
      set({ date: '2025-03-01' }),
      set({ date: '2025-03-02', rpe: 9 }),
      set({ date: '2025-03-02', rpe: undefined }),
      set({ date: '2025-03-02', warmup: true }),
      set({ date: '2025-03-02', rpe: 9.5 }),
    ]
    expect(ownDataCheck(sets).events).toBe(1)
    expect(ownDataCheck([set()]).events).toBe(0)
    expect(ownDataCheck([]).verdict).toBe('too-few')
  })

  it('repsRangeAt orders the range and holds the set inside for the set that made it', () => {
    const r = repsRangeAt(
      {
        point0: 350 / 3,
        point: 350 / 3,
        sd: 0.0691,
        floor: { loadKg: 100, reps: 5, date: 'x' },
      } as never,
      100,
      false,
    )
    expect(r.low).toBeGreaterThan(1)
    expect(r.low).toBeLessThan(5)
    expect(r.high).toBeGreaterThan(5)
  })
})

describe('the verdict rule', () => {
  it.each([
    [29, 29, 0, 0, 'too-few'],
    [30, 20, 10, 0, 'widen'],
    [30, 20, 3, 7, 'holds'],
    [30, 21, 5, 4, 'holds'],
    [30, 28, 1, 1, 'narrow'],
    [100, 92, 4, 4, 'holds'],
    [100, 93, 3, 4, 'narrow'],
  ] as const)('%i events, %i in, %i above, %i below: %s', (n, i, a, b, v) => {
    expect(checkVerdict(n, i, a, b)).toBe(v)
  })
})
