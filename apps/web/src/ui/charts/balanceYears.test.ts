import { describe, expect, it } from 'vitest'
import { PROFILE, balanceRows, rowOf, TWELVE_YEARS } from '../test/balanceFixtures'
import { chartTitle, drawnIn, yearViews } from './balanceYears'

describe('yearViews', () => {
  it('has a room for every year from the first to the last, an empty one for a year with no best', () => {
    const views = yearViews([rowOf(2018, 3.6, 3.2), rowOf(2021, 3.7, null)], PROFILE, true)
    expect(views.map((view) => view.year)).toEqual([2018, 2019, 2020, 2021])
    expect(Object.keys(views[1]!.grades)).toEqual([])
    expect(Object.keys(views[3]!.grades)).toEqual(['run'])
    expect(views[3]!.leader).toBeNull()
    expect(yearViews([], PROFILE, true)).toEqual([])
  })

  it('leaves the ride out until the weight is known, as the hero does, and names the leader only with both', () => {
    const rows = [rowOf(2018, 3.6, 3.2)]
    const [withWeight] = yearViews(rows, PROFILE, true)
    expect(Object.keys(withWeight!.grades)).toEqual(['run', 'ride'])
    expect(withWeight!.leader).toBe('run')
    const [without] = yearViews(rows, PROFILE, false)
    expect(Object.keys(without!.grades)).toEqual(['run'])
    expect(without!.leader).toBeNull()
  })

  it('grades each year at the age on its own day', () => {
    const views = yearViews([rowOf(2018, 3.6, null), rowOf(2038, 3.6, null)], PROFILE, true)
    const at = (view: (typeof views)[number] | undefined) => view!.grades.run!.grade.centre.grade
    // The same speed grades higher at 53 than at 33.
    expect(at(views.at(-1))).toBeGreaterThan(at(views[0]))
  })

  it('has no grade for a year the age tables do not cover', () => {
    const born2020 = { birthYear: 2024, sex: 'male' as const }
    expect(drawnIn(yearViews([rowOf(2018, 3.6, 3.2)], born2020, true))).toEqual([])
  })

  it('carries whether the gate found the best hard, from the library', () => {
    const verdicts = yearViews(balanceRows(TWELVE_YEARS), PROFILE, true).map(
      (view) => view.grades.ride?.verdict,
    )
    expect(verdicts.filter((verdict) => verdict === 'notHard')).toHaveLength(3)
    expect(verdicts.filter((verdict) => verdict === 'hard')).toHaveLength(7)
  })
})

describe('chartTitle', () => {
  it('names what is plotted, whoever led', () => {
    const run = [rowOf(2018, 3.6, 2.8), rowOf(2019, 3.6, 2.8)]
    const ride = [rowOf(2018, 3.6, 4.4), rowOf(2019, 3.6, 4.4)]
    expect(chartTitle(yearViews(run, PROFILE, true))).toBe('Grade by year, run and ride')
    expect(chartTitle(yearViews(ride, PROFILE, true))).toBe('Grade by year, run and ride')
  })

  it('names the sport when only one is graded', () => {
    const runOnly = yearViews([rowOf(2018, 3.6, null), rowOf(2019, 3.7, null)], PROFILE, true)
    expect(chartTitle(runOnly)).toBe('Run grade by year')
  })
})
