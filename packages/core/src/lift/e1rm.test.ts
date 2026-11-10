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
    // The spec's first print (0.01214) was hand-rounded through 122.03; the exact figures are these.
    expect(e.parts.equations).toBeCloseTo(0.012124, 6)
    expect(e.parts.effort).toBeCloseTo(0.01232, 5)
    expect(e.sys).toBeCloseTo(0.066432, 6)
    expect(e.parts.rpeNoise).toBeCloseTo(0.02463, 5)
    expect(e.ind).toBeCloseTo(0.04869, 5)
  })

  it('gives sd 0.08237 and the range 111.7 to 138.4 kg', () => {
    const e = estimateLift([set()])!
    expect(e.sd).toBeCloseTo(0.082365, 6)
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

  it('reads only the 56 days up to the newest session', () => {
    const old = set({ date: '2025-01-06', loadKg: 150 }) // 56 days before 2025-03-03: out
    const inside = set({ date: '2025-01-07', loadKg: 60 }) // 55 days: in
    expect(estimateLift([old, set()])!.sessions).toBe(1)
    expect(estimateLift([inside, set()])!.sessions).toBe(2)
  })

  it('weights a session by 0.5^(days / 14) over its variance', () => {
    // 55 days apart, different R: 5 at RPE 8 (R 7.5) and 3 at RPE 9 (R 4.25).
    const older = set({ date: '2025-01-07', loadKg: 60 })
    const newer = set({ reps: 3, rpe: 9 })
    const a = setEstimate(older)!
    const b = setEstimate(newer)!
    expect(a.reps).not.toBe(b.reps)
    const wa = Math.pow(0.5, 55 / 14) / (a.sys ** 2 + a.ind ** 2)
    const wb = 1 / (b.sys ** 2 + b.ind ** 2)
    const e = estimateLift([older, newer])!
    expect(e.point).toBeCloseTo((wa * a.point + wb * b.point) / (wa + wb), 9)
  })
})

// A session with no RPE is down-weighted by 1 / (1 + exp(-(p / top - 0.96) / 0.015)), top being the
// second-highest session point in the 28 days up to the newest.
describe('near the top, for sessions with no RPE', () => {
  const logistic = (ratio: number): number => 1 / (1 + Math.exp(-(ratio - 0.96) / 0.015))
  const bare = (date: string, loadKg: number): LiftSet => set({ date, loadKg, rpe: undefined })
  const P = medianEquation(100, 7) // five reps, no RPE: R = 7

  function mean(items: { age: number; set: LiftSet; near: number }[]): number {
    let num = 0
    let den = 0
    for (const it of items) {
      const e = setEstimate(it.set)!
      const w = (Math.pow(0.5, it.age / 14) * it.near) / (e.sys ** 2 + e.ind ** 2)
      num += w * e.point
      den += w
    }
    return num / den
  }

  it('down-weights a deload to the logistic of its share of the top', () => {
    const a = bare('2025-03-01', 100)
    const b = bare('2025-03-02', 100)
    const c = bare('2025-03-03', 95) // 0.95 of the top
    expect(logistic(0.95)).toBeCloseTo(0.339, 3)
    const e = estimateLift([a, b, c])!
    const expected = mean([
      { age: 2, set: a, near: logistic(1) },
      { age: 1, set: b, near: logistic(1) },
      { age: 0, set: c, near: logistic(0.95) },
    ])
    expect(e.point).toBeCloseTo(expected, 9)
    // Unweighted by nearness it would sit lower.
    expect(e.point).toBeGreaterThan(
      mean([a, b, c].map((s, i) => ({ age: 2 - i, set: s, near: 1 }))),
    )
  })

  it('keeps weight 1 for an RPE session at the same share of the top', () => {
    const a = bare('2025-03-01', 100)
    const b = bare('2025-03-02', 100)
    const c = set({ loadKg: 70 }) // RPE 8, well under the top
    const e = estimateLift([a, b, c])!
    expect(setEstimate(c)!.point / P).toBeLessThan(0.9)
    const expected = mean([
      { age: 2, set: a, near: logistic(1) },
      { age: 1, set: b, near: logistic(1) },
      { age: 0, set: c, near: 1 },
    ])
    expect(e.point).toBeCloseTo(expected, 9)
  })

  it('takes the top from the last 28 days only', () => {
    // Two older sessions, 30 and 35 days back, sit well above today's. Were they in the top it would
    // be 120 kg's point and today's session would count for nothing.
    const o1 = bare('2025-01-31', 130)
    const o2 = bare('2025-01-26', 120)
    const today = bare('2025-03-02', 100)
    const e = estimateLift([o1, o2, today])!
    const expected = mean([
      { age: 30, set: o1, near: logistic(medianEquation(130, 7) / P) },
      { age: 35, set: o2, near: logistic(medianEquation(120, 7) / P) },
      { age: 0, set: today, near: logistic(1) },
    ])
    expect(e.point).toBeCloseTo(expected, 9)
  })
})

describe('the window follows the newest eligible session', () => {
  it('still answers 60 days after the last session, dated then', () => {
    const e = estimateLift([set()], '2025-05-02')!
    expect(e.date).toBe('2025-03-03')
    expect(e.point).toBeCloseTo(122.32, 2)
  })

  it('is not moved by a trailing day of ineligible sets', () => {
    const early = set({ date: '2025-01-07', loadKg: 60 }) // 55 days before the eligible session
    const trailing = [
      set({ date: '2025-03-10', rpe: 5 }),
      set({ date: '2025-03-10', warmup: true }),
    ]
    const e = estimateLift([early, set(), ...trailing])!
    expect(e).toEqual(estimateLift([early, set()]))
    expect(e.sessions).toBe(2)
    expect(e.date).toBe('2025-03-03')
  })
})

describe('sessions, continued', () => {
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

describe('ties', () => {
  it('goes to more reps, then the newer date', () => {
    const sets = [
      set({ date: '2025-03-01', reps: 3, loadKg: 100 }),
      set({ date: '2025-03-02', reps: 5, loadKg: 100 }),
      set({ date: '2025-03-03', reps: 5, loadKg: 100 }),
    ]
    expect(liftBests(sets).floor).toEqual({ loadKg: 100, reps: 5, date: '2025-03-03' })
    expect(liftBests(sets).repBests.find((b) => b.reps === 5)?.date).toBe('2025-03-03')
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

describe('what the estimate exposes for the change rule', () => {
  it('gives the worked example its terms, independent error and reps, by hand', () => {
    const e = estimateLift([set()])!
    expect(e.terms.curve).toBeCloseTo(0.05864, 5)
    expect(e.terms.centre).toBeCloseTo(0.026, 5)
    expect(e.terms.equations).toBeCloseTo(0.01212, 5)
    expect(e.terms.effort).toBeCloseTo(0.01232, 5)
    expect(e.ind).toBeCloseTo(0.04869, 5)
    expect(e.meanR).toBe(7.5)
  })

  it('takes the near-top pool from the last 14 days, not 28', () => {
    // No RPE: R = reps + 2. Two heavy sessions 3 weeks back, then four at 100 kg in the last 14 days.
    const noRpe = (date: string, loadKg: number): LiftSet => set({ date, loadKg, rpe: undefined })
    const sets = [
      noRpe('2025-03-01', 120),
      noRpe('2025-03-03', 120),
      noRpe('2025-03-17', 100),
      noRpe('2025-03-19', 100),
      noRpe('2025-03-21', 100),
      noRpe('2025-03-24', 100),
    ]
    // The top is the 100 kg point, so the recent sessions keep their weight and the estimate sits near
    // them. A 28-day pool would take the heavy sessions as the top and give the recent ones almost none.
    const e = estimateLift(sets)!
    expect(e.point0).toBeLessThan((medianEquation(100, 7) + medianEquation(120, 7)) / 2)
  })

  it('limits the 3-session floor to 28 days: the first session back after a 5-week gap is its own top', () => {
    const noRpe = (date: string, loadKg: number): LiftSet => set({ date, loadKg, rpe: undefined })
    const sets = [noRpe('2025-03-01', 120), noRpe('2025-03-03', 120), noRpe('2025-04-14', 100)]
    // Without the limit the pool is all three, the top is the 120 kg point and the 100 kg session gets
    // almost no weight, so the estimate would sit at the old level. With it the session is read as it is.
    const e = estimateLift(sets)!
    expect(e.point0).toBeLessThan(medianEquation(100, 7) * 1.1)
  })

  it('falls back to the last 3 sessions within 28 days when 14 days hold fewer', () => {
    const noRpe = (date: string, loadKg: number): LiftSet => set({ date, loadKg, rpe: undefined })
    // Weekly: 03-24 alone is in the 14 days with 03-17; the pool is 03-10, 03-17, 03-24 and the top is the
    // second highest of them, the 100 kg point, so the 60 kg deload keeps near-top weight of about zero.
    const sets = [noRpe('2025-03-10', 100), noRpe('2025-03-17', 60), noRpe('2025-03-24', 100)]
    expect(estimateLift(sets)!.point0).toBeGreaterThan(0.97 * medianEquation(100, 7))
  })
})
