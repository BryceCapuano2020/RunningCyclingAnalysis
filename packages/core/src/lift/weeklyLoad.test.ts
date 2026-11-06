import { describe, expect, it } from 'vitest'
import { weeklyLoad } from './weeklyLoad'
import type { Equipment, LiftSet } from './index'

let order = 0
function s(
  date: string,
  exercise: string,
  equipment: Equipment,
  reps: number,
  loadKg: number,
  extra: Partial<LiftSet> = {},
): LiftSet {
  order += 1
  return { date, exercise, equipment, setOrder: order, reps, loadKg, ...extra }
}

describe('weeklyLoad', () => {
  it('counts a dumbbell pair twice and a barbell once', () => {
    const [w] = weeklyLoad([
      s('2026-03-03', 'bench-press', 'dumbbell', 10, 20),
      s('2026-03-04', 'bench-press', 'barbell', 5, 60),
    ])!
    expect(w!.regions.upper.volumeKg).toBe(10 * 20 * 2 + 5 * 60)
    expect(w!.regions.upper.workingSets).toBe(2)
  })

  it('does not double a dumbbell lift the catalog does not pair', () => {
    const [w] = weeklyLoad([
      s('2026-03-03', 'dumbbell-row', 'cable', 10, 30),
      s('2026-03-03', 'lat-pulldown', 'dumbbell', 10, 30),
    ])!
    expect(w!.regions.upper.volumeKg).toBe(600)
  })

  it('counts added load only for a bodyweight lift', () => {
    const [w] = weeklyLoad([
      s('2026-03-03', 'pull-up', 'bodyweight', 8, 0),
      s('2026-03-03', 'dip', 'bodyweight', 5, 10),
    ])!
    expect(w!.regions.upper.volumeKg).toBe(50)
    expect(w!.regions.upper.bodyweightSets).toBe(2)
    expect(w!.regions.upper.workingSets).toBe(2)
  })

  it('drops marked warm-ups and unmarked sets under 70% of the top that come before it', () => {
    const [w] = weeklyLoad([
      s('2026-03-03', 'back-squat', 'barbell', 5, 40), // under 70 of 100, before the top: warm-up
      s('2026-03-03', 'back-squat', 'barbell', 3, 69.9), // just under 70: warm-up
      s('2026-03-03', 'back-squat', 'barbell', 3, 70), // exactly 70%: work
      s('2026-03-03', 'back-squat', 'barbell', 5, 100), // the top
      s('2026-03-03', 'back-squat', 'barbell', 8, 50), // light but after the top: work
      s('2026-03-03', 'back-squat', 'barbell', 5, 20, { warmup: true }),
    ])!
    const lower = w!.regions.lower
    expect(lower.workingSets).toBe(3)
    expect(lower.volumeKg).toBe(3 * 70 + 5 * 100 + 8 * 50)
  })

  it('judges the warm-up rule per session and per lift', () => {
    const [w] = weeklyLoad([
      s('2026-03-03', 'back-squat', 'barbell', 5, 100),
      s('2026-03-05', 'back-squat', 'barbell', 5, 40),
      s('2026-03-05', 'back-squat', 'barbell', 5, 50), // top of its own session: both are work
      s('2026-03-05', 'leg-press', 'machine', 10, 30),
    ])!
    expect(w!.regions.lower.workingSets).toBe(4)
  })

  it('separates hard sets from sets with effort unknown', () => {
    const [w] = weeklyLoad([
      s('2026-03-03', 'back-squat', 'barbell', 5, 100, { rpe: 7 }),
      s('2026-03-03', 'back-squat', 'barbell', 5, 100, { rpe: 6.5 }),
      s('2026-03-03', 'back-squat', 'barbell', 5, 100, { rpe: 9 }),
      s('2026-03-03', 'back-squat', 'barbell', 5, 100),
    ])!
    expect(w!.regions.lower).toMatchObject({ workingSets: 4, hardSets: 2, effortUnknownSets: 1 })
  })

  it('splits weeks between Sunday and Monday and names the Monday', () => {
    const weeks = weeklyLoad([
      s('2026-03-01', 'curl', 'dumbbell', 10, 10), // Sunday
      s('2026-03-02', 'curl', 'dumbbell', 10, 10), // Monday
      s('2026-03-08', 'curl', 'dumbbell', 10, 10), // next Sunday
      s('2026-03-02', 'mystery-lift', 'other', 10, 10),
    ])
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-02-23', '2026-03-02'])
    expect(weeks[0]!.regions.upper.workingSets).toBe(1)
    expect(weeks[1]!.regions.upper.workingSets).toBe(2)
    expect(weeks[1]!.regions.other.workingSets).toBe(1)
  })
})
