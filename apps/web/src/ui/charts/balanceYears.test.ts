import { describe, expect, it } from 'vitest'
import { PROFILE, balanceRows, rowOf, TWELVE_YEARS } from '../balanceFixtures'
import { drawnIn, titleOf, yearViews } from './balanceYears'

/** Rows from 2018 where each year's leader is the one named: the run at 3.6 m/s against a ride 0.8 m/s slower, or faster, or level. */
const LEADERS = { run: 3.6 - 0.8, ride: 3.6 + 0.8, even: 3.6 }
function titled(...leaders: (keyof typeof LEADERS)[]): string {
  const rows = leaders.map((leader, i) => rowOf(2018 + i, 3.6, LEADERS[leader]))
  return titleOf(yearViews(rows, PROFILE, true))
}

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

describe('titleOf', () => {
  it('names who led every year, or that they were level', () => {
    expect(titled('run', 'run', 'run')).toBe('Running led every year')
    expect(titled('ride', 'ride')).toBe('Cycling led every year')
    expect(titled('even', 'even')).toBe('Running and cycling were level every year')
  })

  it('names the year that ended a lead of two years or more', () => {
    expect(titled('run', 'run', 'run', 'ride', 'ride')).toBe('Running led every year until 2021')
    expect(titled('ride', 'ride', 'even')).toBe('Cycling led every year until 2020')
  })

  it('counts the years each led when the lead went back and forth', () => {
    expect(titled('run', 'ride', 'run', 'ride', 'run')).toBe('Running led in 3 of 5 years')
    expect(titled('run', 'ride')).toBe('Cycling led in 1 of 2 years')
  })

  it('is the metric with fewer than two years of both sports', () => {
    expect(titled('run')).toBe('Age grade by year')
    const runOnly = yearViews([rowOf(2018, 3.6, null), rowOf(2019, 3.7, null)], PROFILE, true)
    expect(titleOf(runOnly)).toBe('Running age grade by year')
    const mixed = yearViews([rowOf(2018, 3.6, null), rowOf(2019, 3.7, 3.2)], PROFILE, true)
    expect(titleOf(mixed)).toBe('Age grade by year')
  })

  it('skips a year with one sport when it finds the lead, but keeps the year in the chart', () => {
    const rows = [rowOf(2018, 3.6, 3.0), rowOf(2019, 3.6, null), rowOf(2020, 3.6, 4.4)]
    const views = yearViews(rows, PROFILE, true)
    expect(views).toHaveLength(3)
    expect(titleOf(views)).toBe('Cycling led in 1 of 2 years')
  })
})
