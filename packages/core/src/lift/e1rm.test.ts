import { describe, expect, it } from 'vitest'
import { dayOfLiftDate, estimateLift, liftBests } from './estimate'
import { brzycki, epley, logSlope, lombardi, medianEquation } from './equations'
import { setEstimate } from './setEstimate'
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

describe('the worked example, by hand from docs/design/e1rm.md section 2', () => {
  // 100 kg for 5 at RPE 8: R = 5 + 1.25 x 2 = 7.5.
  it('reads the three equations and their median', () => {
    expect(epley(100, 7.5)).toBeCloseTo(125, 2)
    expect(brzycki(100, 7.5)).toBeCloseTo(122.03, 2)
    expect(lombardi(100, 7.5)).toBeCloseTo(122.32, 2)
    expect(medianEquation(100, 7.5)).toBeCloseTo(122.32, 2)
    expect(logSlope(7.5)).toBeCloseTo(0.02463, 5)
  })

  it('splits the error into the printed terms', () => {
    const e = setEstimate(set())!
    expect(e.reps).toBe(7.5)
    expect(e.point).toBeCloseTo(122.32, 2)
    expect(e.parts.curve).toBeCloseTo(0.05864, 5)
    expect(e.parts.centre).toBeCloseTo(0.026, 5)
    // The spec's 0.01214 was hand-rounded through 122.03; the exact figure is 0.012124.
    expect(e.parts.equations).toBeCloseTo(0.01214, 4)
    expect(e.parts.effort).toBeCloseTo(0.01232, 5)
    expect(e.sys).toBeCloseTo(0.06644, 4)
    expect(e.parts.rpeNoise).toBeCloseTo(0.02463, 5)
    expect(e.ind).toBeCloseTo(0.04869, 5)
  })

  it('gives sd 0.08237 and the range 111.7 to 138.4 kg', () => {
    const e = estimateLift([set()])!
    expect(e.sd).toBeCloseTo(0.08237, 4)
    expect(e.point).toBeCloseTo(122.32, 2)
    expect(e.low).toBeCloseTo(111.7, 1)
    expect(e.high).toBeCloseTo(138.4, 1)
    expect(e.sessions).toBe(1)
    expect(e.date).toBe('2025-03-03')
  })
})

describe('set eligibility', () => {
  it('skips warm-ups, empty sets, zero load and bodyweight', () => {
    expect(setEstimate(set({ warmup: true }))).toBeNull()
    expect(setEstimate(set({ reps: 0 }))).toBeNull()
    expect(setEstimate(set({ loadKg: 0 }))).toBeNull()
    expect(setEstimate(set({ equipment: 'bodyweight' }))).toBeNull()
    expect(setEstimate(set({ exercise: 'pull-up', equipment: 'other' }))).toBeNull()
  })

  it('takes RPE 6 and refuses 5.5', () => {
    expect(setEstimate(set({ rpe: 6 }))?.reps).toBe(10)
    expect(setEstimate(set({ rpe: 5.5 }))).toBeNull()
  })

  it('refuses R above 15 and takes R of exactly 15', () => {
    expect(setEstimate(set({ reps: 10, rpe: 6 }))?.reps).toBe(15)
    expect(setEstimate(set({ reps: 11, rpe: 6 }))).toBeNull()
    expect(setEstimate(set({ reps: 13, rpe: undefined }))?.reps).toBe(15)
    expect(setEstimate(set({ reps: 14, rpe: undefined }))).toBeNull()
  })

  it('reads no RPE as two in reserve with the unknown-effort spread', () => {
    const e = setEstimate(set({ rpe: undefined }))!
    expect(e.reps).toBe(7)
    expect(e.hasRpe).toBe(false)
    expect(e.parts.rpeNoise).toBe(0)
    expect(e.ind).toBeCloseTo(0.042, 6)
  })

  it('marks the deadlift family from the catalog, and not an unknown exercise', () => {
    expect(setEstimate(set({ exercise: 'sumo-deadlift' }))?.deadlift).toBe(true)
    expect(setEstimate(set({ exercise: 'my-pull' }))?.deadlift).toBe(false)
  })
})

describe('finite results', () => {
  const finite = (sets: LiftSet[]): void => {
    const e = estimateLift(sets)!
    for (const v of [e.point, e.low, e.high, e.sd]) expect(Number.isFinite(v)).toBe(true)
    expect(e.floor.loadKg).toBeLessThanOrEqual(e.low)
    expect(e.low).toBeLessThanOrEqual(e.point)
    expect(e.point).toBeLessThanOrEqual(e.high)
  }

  it('at R = 1: a single at RPE 10 is its own load', () => {
    const e = setEstimate(set({ reps: 1, rpe: 10 }))!
    expect(e.point).toBe(100)
    finite([set({ reps: 1, rpe: 10 })])
  })

  it('at R = 15, with a fractional RPE, and with one session', () => {
    finite([set({ reps: 10, rpe: 6 })])
    finite([set({ rpe: 8.5, reps: 6 })])
    finite([set({ rpe: undefined, reps: 3 })])
  })
})

describe('sessions', () => {
  it('takes each session from its highest-point set, so a fatigued later set is ignored', () => {
    const day = [set({ reps: 5, rpe: 8 }), set({ reps: 5, loadKg: 90, rpe: 8 })]
    const e = estimateLift(day)!
    expect(e.sessions).toBe(1)
    expect(e.point).toBeCloseTo(122.32, 2)
  })

  it('weights the newer session more and reads only the 56 days up to the newest', () => {
    const old = set({ date: '2025-01-06', loadKg: 150 }) // 56 days before 2025-03-03: out
    const inside = set({ date: '2025-01-07', loadKg: 60 }) // 55 days: in
    const newest = set({ loadKg: 100 })
    expect(estimateLift([old, newest])!.sessions).toBe(1)
    const both = estimateLift([inside, newest])!
    expect(both.sessions).toBe(2)
    expect(both.point).toBeGreaterThan(medianEquation(60, 7.5))
    expect(both.point).toBeLessThan(medianEquation(100, 7.5))
  })

  it('dates the answer at the newest session and ends the window at asOf', () => {
    const sets = [set({ date: '2025-02-03' }), set({ date: '2025-03-03', loadKg: 120 })]
    expect(estimateLift(sets)!.date).toBe('2025-03-03')
    const early = estimateLift(sets, '2025-02-10')!
    expect(early.date).toBe('2025-02-03')
    expect(early.floor.loadKg).toBe(100)
  })

  it('widens the top, never the bottom, for a deadlift-family lift', () => {
    const squat = estimateLift([set()])!
    const pull = estimateLift([set({ exercise: 'deadlift' })])!
    expect(pull.low).toBeCloseTo(squat.low, 9)
    expect(pull.high).toBeCloseTo(squat.high * 1.05, 6)
  })

  it('has no estimate when nothing is eligible', () => {
    expect(estimateLift([set({ warmup: true }), set({ equipment: 'bodyweight' })])).toBeNull()
    expect(estimateLift([])).toBeNull()
  })

  it('counts days through the calendar', () => {
    expect(dayOfLiftDate('2025-03-04') - dayOfLiftDate('2025-02-28')).toBe(4)
    expect(dayOfLiftDate('2024-03-01') - dayOfLiftDate('2024-02-28')).toBe(2)
  })
})

describe('the floor clamp', () => {
  // A heavy working set read as too far from failure (RPE 5) is never an estimate but was lifted.
  it('lifts the low end to the floor when the lifted load is above it', () => {
    const e = estimateLift([set(), set({ loadKg: 115, reps: 1, rpe: 5 })])!
    expect(e.floor).toEqual({ loadKg: 115, reps: 1, date: '2025-03-03' })
    expect(e.low).toBe(115)
    expect(e.point).toBeCloseTo(122.32, 2)
    expect(e.high).toBeGreaterThan(e.point)
  })

  it('lifts all three to the floor when it passes the whole range', () => {
    const e = estimateLift([set(), set({ loadKg: 200, reps: 1, rpe: 5 })])!
    expect([e.low, e.point, e.high]).toEqual([200, 200, 200])
  })
})

describe('floor and rep bests', () => {
  const sets = [
    set({ date: '2025-02-24', reps: 5, loadKg: 90 }),
    set({ date: '2025-03-03', reps: 5, loadKg: 100 }),
    set({ date: '2025-03-03', reps: 3, loadKg: 110 }),
    set({ date: '2025-03-03', reps: 3, loadKg: 140, warmup: true }),
    set({ date: '2025-03-03', reps: 20, loadKg: 40 }),
  ]

  it('is the heaviest working set with its reps and date, and warm-ups never count', () => {
    expect(liftBests(sets).floor).toEqual({ loadKg: 110, reps: 3, date: '2025-03-03' })
  })

  it('keeps the heaviest load at each rep count from 1 to 15', () => {
    expect(liftBests(sets).repBests).toEqual([
      { loadKg: 110, reps: 3, date: '2025-03-03' },
      { loadKg: 100, reps: 5, date: '2025-03-03' },
    ])
  })

  it('reads only the window', () => {
    expect(liftBests(sets, '2025-02-24').floor?.loadKg).toBe(90)
    expect(liftBests([])).toEqual({ floor: null, repBests: [] })
  })
})
