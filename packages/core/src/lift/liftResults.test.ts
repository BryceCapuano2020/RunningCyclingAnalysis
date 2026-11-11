import { describe, expect, it } from 'vitest'
import '../test/deviceZone'
import {
  bigThreeTotal,
  buildLiftState,
  gradedLiftOf,
  liftCornerGrade,
  liftChange,
  liftGrade,
  liftHistory,
  liftLevelTotals,
  liftResultsOf,
  liftWindowCounts,
  WINDOW_DAYS,
} from './index'
import type { GradedEstimate, LiftSet } from './index'

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

const TODAY = '2026-03-20'
const sets: LiftSet[] = [
  set('2026-02-10', 'back-squat', 'barbell', 5, 100, 8),
  set('2026-03-02', 'back-squat', 'barbell', 5, 105, 8),
  set('2026-03-09', 'back-squat', 'barbell', 3, 115, 9),
  set('2026-03-04', 'bench-press', 'barbell', 5, 70, 8),
  set('2026-03-11', 'bench-press', 'barbell', 5, 72.5, 8),
  set('2026-03-06', 'deadlift', 'barbell', 3, 150, 8),
  set('2026-03-13', 'sumo-deadlift', 'barbell', 3, 160, 8),
  set('2026-03-12', 'overhead-press', 'barbell', 6, 40, 8),
  set('2026-03-12', 'pull-up', 'bodyweight', 6, 0),
]
const settings = { massKg: 80, bikeMassKg: 9, birthYear: 1990, sex: 'male' as const }
const profile = { birthYear: 1990, sex: 'male' as const }

describe('liftResultsOf', () => {
  const results = liftResultsOf(sets, settings, TODAY)

  it('carries the state buildLiftState gives for the same sets', () => {
    expect(results.state).toStrictEqual(buildLiftState(sets, settings))
    expect(results.state.lifts.length).toBeGreaterThan(4)
  })

  it('has a history and window counts for each estimated lift, and none for the rest', () => {
    const estimated = results.state.lifts.filter((l) => l.estimate !== null)
    expect(estimated.length).toBeLessThan(results.state.lifts.length)
    expect(Object.keys(results.histories).sort()).toEqual(estimated.map((l) => l.key).sort())
    for (const lift of estimated) {
      const own = sets.filter((s) => s.exercise === lift.exercise && s.equipment === lift.equipment)
      expect(results.histories[lift.key]).toStrictEqual(liftHistory(own))
      expect(results.windows[lift.key]).toStrictEqual(liftWindowCounts(own, TODAY))
    }
  })

  it('grades the big three and the corner with the functions the page calls', () => {
    const graded = results.state.lifts.flatMap((l): GradedEstimate[] => {
      const lift = gradedLiftOf(l.exercise, l.equipment)
      return lift === null || l.estimate === null ? [] : [{ lift, estimate: l.estimate }]
    })
    const big = bigThreeTotal(graded)
    expect(results.bigThree).toStrictEqual(big)
    expect(big.kind).toBe('total')
    // The sumo deadlift is the heavier of the two deadlifts, so it is the part that is graded.
    expect(big.parts.map((p) => p.lift)).toEqual(['squat', 'bench', 'deadlift'])
    expect(results.bigThreeGrades).toStrictEqual(
      big.parts.map((p) => liftGrade({ lift: p.lift, estimate: p.estimate }, profile, settings)),
    )
    expect(results.bigThreeGrades.every((g) => g.kind === 'graded')).toBe(true)
    expect(results.corner).toStrictEqual(liftCornerGrade(graded, profile, settings))
    expect(results.corner.kind).toBe('graded')
  })

  it('lists the big three first in their order, the most recent first within a lift, then the others', () => {
    expect(results.order).toEqual([
      'back-squat.barbell',
      'bench-press.barbell',
      'sumo-deadlift.barbell',
      'deadlift.barbell',
      'overhead-press.barbell',
    ])
  })

  it('leads with the big three lift trained last, and grades and dates it as the page does', () => {
    const lead = results.lead!
    expect(lead.key).toBe('sumo-deadlift.barbell')
    const summary = results.state.lifts.find((l) => l.key === lead.key)!
    expect(lead.grade).toStrictEqual(
      liftGrade({ lift: 'deadlift', estimate: summary.estimate! }, profile, settings),
    )
    const own = sets.filter((s) => s.exercise === 'sumo-deadlift')
    expect(lead.change).toStrictEqual(liftChange(own, summary.estimate!.date, WINDOW_DAYS))
  })

  it('leads with the lift trained last when no big three lift has an estimate', () => {
    const accessory = liftResultsOf(
      sets.filter((s) => s.exercise === 'overhead-press'),
      settings,
      TODAY,
    )
    expect(accessory.lead?.key).toBe('overhead-press.barbell')
    expect(accessory.lead?.grade).toBeNull()
    expect(accessory.bigThree.kind).toBe('none')
  })

  it('gives the level totals in each unit, as liftLevelTotals does at today and the body mass', () => {
    expect(results.levels.metric).toStrictEqual(liftLevelTotals(profile, TODAY, 80, 'metric'))
    expect(results.levels.imperial).toStrictEqual(liftLevelTotals(profile, TODAY, 80, 'imperial'))
    expect(results.levels.metric).not.toBeNull()
    expect(results.levels.imperial).not.toStrictEqual(results.levels.metric)
  })

  it('has no grade without a year of birth or sex, and none at a placeholder mass', () => {
    const { birthYear: _b, ...noYear } = settings
    const noProfile = liftResultsOf(sets, noYear, TODAY)
    expect(noProfile.corner).toStrictEqual({ kind: 'gap', why: 'no-profile' })
    expect(noProfile.levels).toStrictEqual({ metric: null, imperial: null })
    const assumed = liftResultsOf(sets, { ...settings, massAssumed: true }, TODAY)
    expect(assumed.corner).toStrictEqual({ kind: 'gap', why: 'no-mass' })
    expect(assumed.levels).toStrictEqual({ metric: null, imperial: null })
    // The estimates do not depend on either.
    expect(noProfile.bigThree).toStrictEqual(results.bigThree)
  })

  it('is empty for an empty log', () => {
    const none = liftResultsOf([], settings, TODAY)
    expect(none.lead).toBeNull()
    expect(none.histories).toStrictEqual({})
    expect(none.bigThree).toStrictEqual({ kind: 'none', parts: [] })
    expect(none.state.lifts).toStrictEqual([])
  })
})
