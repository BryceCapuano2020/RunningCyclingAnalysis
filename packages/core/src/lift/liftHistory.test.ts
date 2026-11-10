import { describe, expect, it } from 'vitest'
import { estimateLift } from './estimate'
import { liftHistory } from './liftHistory'
import { simulate } from './test/lifters'
import { SCENARIOS } from './test/scenarios'
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

describe('liftHistory', () => {
  it('is empty with nothing eligible', () => {
    expect(liftHistory([])).toEqual([])
    expect(liftHistory([set({ warmup: true }), set({ rpe: 5 })])).toEqual([])
  })

  it('one session gives the spec worked example at its date: 122.3 kg, range 111.7 to 138.4, floor 100', () => {
    const [p, ...rest] = liftHistory([set()])
    expect(rest).toEqual([])
    expect(p?.date).toBe('2025-03-03')
    expect(p?.point).toBeCloseTo(122.32, 2)
    expect(p?.low).toBeCloseTo(111.7, 1)
    expect(p?.high).toBeCloseTo(138.4, 1)
    expect(p?.floor).toBe(100)
  })

  it('gives one point per session date, ascending, and skips a date with no eligible set', () => {
    const sets = [
      set({ date: '2025-03-10', loadKg: 105 }),
      set({ date: '2025-03-03' }),
      set({ date: '2025-03-05', warmup: true }),
      set({ date: '2025-03-07', loadKg: 102.5 }),
    ]
    expect(liftHistory(sets).map((p) => p.date)).toEqual(['2025-03-03', '2025-03-07', '2025-03-10'])
  })

  it('reads only the sessions up to each date: the first point ignores later, heavier work', () => {
    const sets = [set(), set({ date: '2025-03-10', loadKg: 140 })]
    const [first, second] = liftHistory(sets)
    expect(first?.point).toBeCloseTo(122.32, 2)
    expect(second?.floor).toBe(140)
  })

  it('drops a session once it is 56 days behind: the later point is the later session alone', () => {
    const sets = [set({ loadKg: 80 }), set({ date: '2025-04-28', loadKg: 100 })]
    // 56 days after 03-03 is 04-28: the old session is outside the window.
    const last = liftHistory(sets)[1]
    expect(last?.floor).toBe(100)
    expect(last?.point).toBeCloseTo(122.32, 2)
  })

  it('matches estimateLift as of each date over two years at three sessions a week', () => {
    const spec = { ...SCENARIOS['hypertrophy-8-12']!, sessionsPerWeek: 3, weeks: 104 }
    const { sets, sessionDates } = simulate({
      ...spec,
      name: 'h',
      seed: 5,
      shape: { kind: 'linear', k: 8 },
    })
    const history = liftHistory(sets)
    // Deload sessions read 4 or more in reserve and have no eligible set.
    expect(history.length).toBeGreaterThan(250)
    expect(history.every((p) => sessionDates.includes(p.date))).toBe(true)
    for (const p of history) {
      const e = estimateLift(sets, p.date)!
      expect([p.point, p.low, p.high, p.floor]).toEqual([e.point, e.low, e.high, e.floor.loadKg])
    }
  })
})
