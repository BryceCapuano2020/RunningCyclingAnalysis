import { describe, expect, it } from 'vitest'
import { buildLiftState, bigThreeTotal, gradedLiftOf, liftGrade } from '@rca/core/lift'
import type { LiftSet } from '@rca/core/lift'
import { formatMass } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { formatGrade } from '../gradeFormat'
import { liftTileOf } from './liftTile'

const SETTINGS = { massKg: 80, bikeMassKg: 9 }
const PROFILE = { birthYear: 1990, sex: 'male' } as const

const set = (exercise: string, loadKg: number, reps = 5): LiftSet => ({
  date: '2026-03-02',
  exercise,
  equipment: 'barbell',
  setOrder: 1,
  reps,
  loadKg,
})

const SQUAT = set('back-squat', 100)
const BENCH = set('bench-press', 70)
const DEADLIFT = set('deadlift', 120)
const NB = (text: string) => text.replaceAll(' ', ' ')

const tileOf = (
  sets: LiftSet[],
  profile: typeof PROFILE | null = PROFILE,
  units: UnitSystem = 'metric',
) => liftTileOf(buildLiftState(sets, SETTINGS).lifts, profile, SETTINGS, units)

describe('the lifting row', () => {
  it('has the total of the three as its big number and a detail row for each, in order', () => {
    const state = buildLiftState([DEADLIFT, BENCH, SQUAT], SETTINGS)
    const tile = liftTileOf(state.lifts, PROFILE, SETTINGS, 'metric')
    const parts = state.lifts.map((summary) => ({
      lift: gradedLiftOf(summary.exercise, summary.equipment)!,
      estimate: summary.estimate!,
    }))
    const big = bigThreeTotal(parts)
    if (big.kind !== 'total') throw new Error('total')
    expect(tile.heading).toBe('Big three total')
    expect(`${tile.figure?.number} ${tile.figure?.unit}`).toBe(formatMass(big.kg, 'metric'))
    expect(tile.rows.map((row) => row.label)).toEqual(['Squat', 'Bench', 'Deadlift'])
    for (const [index, row] of tile.rows.entries()) {
      const part = big.parts[index]!
      const grade = liftGrade({ lift: part.lift, estimate: part.estimate }, PROFILE, SETTINGS)
      if (grade.kind !== 'graded') throw new Error('graded')
      expect(row.value).toBe(
        `${formatGrade(grade.grade.centre.grade)} · ${NB(formatMass(part.kg, 'metric'))}`,
      )
    }
  })

  it('states the load in the profile unit', () => {
    const tile = tileOf([SQUAT, BENCH, DEADLIFT], PROFILE, 'imperial')
    expect(tile.figure?.unit).toBe('lb')
    expect(tile.rows[0]?.value).toMatch(/ lb$/)
  })

  it('names the heaviest lift and lists only what exists when one or two are estimated', () => {
    const tile = tileOf([SQUAT, BENCH])
    expect(tile.heading).toBe('Squat, projected 1RM')
    expect(tile.rows.map((row) => row.label)).toEqual(['Squat', 'Bench'])
    expect(tileOf([BENCH]).heading).toBe('Bench, projected 1RM')
  })

  it('shows the one-rep max alone for a lift with no grade, here for want of a profile', () => {
    const tile = tileOf([SQUAT, BENCH, DEADLIFT], null)
    expect(tile.figure).not.toBeNull()
    for (const row of tile.rows) expect(row.value).toMatch(/^[\d.]+\u00a0kg$/)
  })

  it('has no figure and no rows with none of the three, and ignores lifts that are not graded', () => {
    expect(tileOf([])).toEqual({ heading: 'Big three total', figure: null, rows: [] })
    expect(tileOf([{ ...set('goblet-squat', 20), equipment: 'dumbbell' }]).figure).toBeNull()
  })
})
