import { describe, expect, it } from 'vitest'
import { buildLiftState } from '@rca/core/lift'
import type { LiftSet } from '@rca/core/lift'
import { liftLevelRowsOf } from './liftLevelRows'

const SETTINGS = { massKg: 80, bikeMassKg: 9 }
const PROFILE = { birthYear: 1990, sex: 'male' } as const
const TODAY = '2026-03-09'

const set = (exercise: string, loadKg: number): LiftSet => ({
  date: '2026-03-02',
  exercise,
  equipment: 'barbell',
  setOrder: 1,
  reps: 5,
  loadKg,
})

const SUMMARIES = buildLiftState(
  [set('back-squat', 100), set('bench-press', 70), set('deadlift', 120)],
  SETTINGS,
).lifts

describe('the Lift page levels', () => {
  it('gives every level a total in the athlete’s unit, from World down', () => {
    const rows = liftLevelRowsOf([], PROFILE, SETTINGS, 'imperial', TODAY)!
    expect(rows.map((row) => row.label)).toEqual([
      'World',
      'National',
      'Regional',
      'Local',
      'Club',
      'Trained',
      'Active',
      'Recreational',
    ])
    expect(rows[0]!.range).toMatch(/ lb and up$/)
    expect(rows[1]!.range).toMatch(/^[\d.]+ to [\d.]+ lb$/)
    expect(rows[7]!.range).toMatch(/^Up to [\d.]+ lb$/)
    expect(liftLevelRowsOf([], PROFILE, SETTINGS, 'metric', TODAY)![0]!.range).toMatch(
      / kg and up$/,
    )
  })

  it('marks no level without a graded lift, and the corner’s level with one', () => {
    expect(liftLevelRowsOf([], PROFILE, SETTINGS, 'metric', TODAY)!.some((row) => row.mine)).toBe(
      false,
    )
    const marked = liftLevelRowsOf(SUMMARIES, PROFILE, SETTINGS, 'metric', TODAY)!.filter(
      (row) => row.mine,
    )
    expect(marked).toHaveLength(1)
  })

  it('holds back while the year of birth, sex or an entered weight is missing', () => {
    expect(liftLevelRowsOf(SUMMARIES, null, SETTINGS, 'metric', TODAY)).toBeNull()
    expect(
      liftLevelRowsOf(SUMMARIES, PROFILE, { ...SETTINGS, massAssumed: true }, 'metric', TODAY),
    ).toBeNull()
  })
})
