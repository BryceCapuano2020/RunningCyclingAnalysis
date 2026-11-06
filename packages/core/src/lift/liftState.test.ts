import { describe, expect, it } from 'vitest'
import '../test/deviceZone'
import { buildLiftState, LIFT_REVISION } from './index'
import type { LiftSet } from './index'

let order = 0
const set = (
  date: string,
  exercise: string,
  equipment: LiftSet['equipment'],
  reps: number,
  loadKg: number,
  rpe?: number,
): LiftSet => {
  order += 1
  return {
    date,
    exercise,
    equipment,
    setOrder: order,
    reps,
    loadKg,
    ...(rpe === undefined ? {} : { rpe }),
  }
}

const sets: LiftSet[] = [
  set('2026-03-02', 'back-squat', 'barbell', 5, 100, 8),
  set('2026-03-09', 'back-squat', 'barbell', 5, 105, 8),
  set('2026-03-04', 'deadlift', 'barbell', 3, 140),
  set('2026-03-04', 'pull-up', 'bodyweight', 6, 10),
  set('2026-03-04', 'bench-press', 'barbell', 5, 20, 5), // RPE under 6: no eligible set
]
const settings = {
  massKg: 70,
  bikeMassKg: 9,
  measurements: [{ kind: 'massKg' as const, value: 80, from: '2026-03-01' }],
}

describe('buildLiftState', () => {
  const state = buildLiftState(sets, settings)

  it('groups by lift, newest first, with the revision', () => {
    expect(state.revision).toBe(LIFT_REVISION)
    expect(state.lifts.map((l) => l.key)).toEqual([
      'back-squat.barbell',
      'bench-press.barbell',
      'deadlift.barbell',
      'pull-up.bodyweight',
    ])
  })

  it('reads an estimate, floor, rep bests and relative strength', () => {
    const squat = state.lifts[0]!
    expect(squat.estimate!.date).toBe('2026-03-09')
    expect(squat.floor).toEqual({ loadKg: 105, reps: 5, date: '2026-03-09' })
    expect(squat.repBests).toEqual([{ loadKg: 105, reps: 5, date: '2026-03-09' }])
    expect(squat.relative!.massKg).toBe(80)
    expect(squat.relative!.ratio.point).toBeCloseTo(squat.estimate!.point / 80, 9)
    expect(squat.lastDate).toBe('2026-03-09')
    expect(squat.flags).toEqual([])
  })

  it('says why a lift has no estimate, and flags deadlifts and unknown effort', () => {
    const [, bench, dead, pull] = state.lifts
    expect(bench!.estimate).toBeNull()
    expect(bench!.reason).toBe('no-eligible-set')
    expect(pull!.reason).toBe('bodyweight')
    expect(pull!.relative).toBeNull()
    expect(dead!.flags).toEqual(['deadlift-may-read-low', 'effort-unknown'])
  })

  it('carries weekly load and cuts a period by date', () => {
    expect(state.weeks.map((w) => w.weekStart)).toEqual(['2026-03-02', '2026-03-09'])
    const early = buildLiftState(sets, settings, { to: '2026-03-08' })
    expect(early.lifts.find((l) => l.key === 'back-squat.barbell')!.lastDate).toBe('2026-03-02')
    expect(early.weeks).toHaveLength(1)
    expect(buildLiftState(sets, settings, { from: '2026-03-09' }).lifts).toHaveLength(1)
  })
})
