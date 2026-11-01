import { describe, expect, it } from 'vitest'
import type { SportYearCurves } from '@rca/core/history'
import { RIDE_CURVES, RUN_CURVES } from '../historyBestsFixtures'
import { curveCell, curvesTitle, labelledYears, yearCurvesModel } from './yearCurvesModel'

describe('yearCurvesModel', () => {
  it('is the years oldest first, each as recent as its place among them, on the durations any year has', () => {
    const model = yearCurvesModel('run', RUN_CURVES)!
    expect(model.lines.map((line) => line.year)).toEqual([2020, 2021, 2022, 2023])
    expect(model.lines.map((line) => line.recency)).toEqual([0, 1 / 3, 2 / 3, 1])
    expect(model.durations).toEqual([180, 300, 1200, 3600])
    expect(model.latestYear).toBe(2023)
  })

  it('takes the 20 minute best as the focus, and its highest year as the best year', () => {
    const model = yearCurvesModel('run', RUN_CURVES)!
    expect(model.durations[model.focus!]).toBe(1200)
    expect(model.bestYear).toBe(2021)
    expect(labelledYears(model)).toEqual([2021, 2023])
  })

  it('labels one year when the newest is the best', () => {
    const model = yearCurvesModel('ride', RIDE_CURVES)!
    expect(model.bestYear).toBe(2023)
    expect(labelledYears(model)).toEqual([2023])
  })

  it('states the finding as the title: peaked in an earlier year, or highest in the newest', () => {
    expect(curvesTitle(yearCurvesModel('run', RUN_CURVES)!)).toBe('Your 20 min pace peaked in 2021')
    expect(curvesTitle(yearCurvesModel('ride', RIDE_CURVES)!)).toBe(
      'Your 20 min power is highest in 2023',
    )
  })

  it('falls back to the longest length two years share when only one year has a 20 minute best', () => {
    const curves: SportYearCurves = {
      durations: [300, 1200, 3600],
      years: [
        { year: 2021, values: [300, 250, 200], hard: false },
        { year: 2022, values: [320, null, 210], hard: false },
      ],
    }
    const model = yearCurvesModel('ride', curves)!
    expect(model.durations[model.focus!]).toBe(3600)
    expect(curvesTitle(model)).toBe('Your 60 min power is highest in 2022')
  })

  it('names the measure when no length is shared, and has no model without a year', () => {
    const curves: SportYearCurves = {
      durations: [300, 1200],
      years: [
        { year: 2021, values: [300, null], hard: false },
        { year: 2022, values: [null, 250], hard: false },
      ],
    }
    const model = yearCurvesModel('ride', curves)!
    expect(model.focus).toBeNull()
    expect(model.bestYear).toBeNull()
    expect(curvesTitle(model)).toBe('Ride best curve by year')
    expect(yearCurvesModel('run', { durations: [300], years: [] })).toBeNull()
  })

  it('writes a table cell with at least for a 20 minute best not confirmed hard, and none for a gap', () => {
    const model = yearCurvesModel('run', RUN_CURVES)!
    const at = (year: number, durationS: number, units: 'metric' | 'imperial' = 'metric') =>
      curveCell(
        model,
        model.lines.find((line) => line.year === year)!,
        model.durations.indexOf(durationS),
        units,
      )
    expect(at(2021, 1200)).toBe('3:58 /km')
    expect(at(2023, 1200)).toBe('At least 4:16 /km')
    // The pace over an hour is not a 20 minute best, so no floor is named for it.
    expect(at(2023, 3600)).toBe('4:46 /km')
    expect(at(2022, 3600)).toBe('None')
    expect(at(2021, 1200, 'imperial')).toBe('6:23 /mi')
  })
})
