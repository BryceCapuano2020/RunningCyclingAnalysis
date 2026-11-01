import { describe, expect, it } from 'vitest'
import type { SportYearCurves } from '@rca/core/history'
import { RIDE_CURVES, RUN_CURVES } from '../historyBestsFixtures'
import {
  curveCell,
  curvesTitle,
  isCrowded,
  labelledYears,
  namedYears,
  yearCurvesModel,
} from './yearCurvesModel'

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
        { year: 2021, values: [300, 250, 200], hard: false, estimated: [] },
        { year: 2022, values: [320, null, 210], hard: false, estimated: [] },
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
        { year: 2021, values: [300, null], hard: false, estimated: [] },
        { year: 2022, values: [null, 250], hard: false, estimated: [] },
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

  it('says fastest for a pace and highest for a power when the newest year holds the best', () => {
    const run: SportYearCurves = {
      durations: [1200],
      years: [
        { year: 2021, values: [3.8], hard: true, estimated: [] },
        { year: 2022, values: [4.2], hard: true, estimated: [] },
      ],
    }
    expect(curvesTitle(yearCurvesModel('run', run)!)).toBe('Your 20 min pace is fastest in 2022')
    expect(curvesTitle(yearCurvesModel('ride', RIDE_CURVES)!)).toBe(
      'Your 20 min power is highest in 2023',
    )
  })
})

describe('estimated values in the year curves', () => {
  const curves = (flags: number[][]): SportYearCurves => ({
    durations: [300, 1200],
    years: flags.map((estimated, n) => ({
      year: 2020 + n,
      // The later the year, the higher the watts.
      values: [300 + n * 10, 250 + n * 10],
      hard: true,
      estimated,
    })),
  })

  it('never takes an estimate as the best year while a year has a measured value', () => {
    // The newest year is the highest and a bike model's; the best is the measured year before it.
    const model = yearCurvesModel('ride', curves([[], [], [1]]))!
    expect(model.bestYear).toBe(2021)
    expect(curvesTitle(model)).toBe('Your 20 min power peaked in 2021')
  })

  it('takes the highest year when every value is an estimate', () => {
    expect(yearCurvesModel('ride', curves([[1], [1], [1]]))!.bestYear).toBe(2022)
  })

  it('tags an estimated value in a table cell, after a floor’s at least', () => {
    const model = yearCurvesModel('ride', curves([[], [1], []]))!
    const [, estimate] = model.lines
    expect(curveCell(model, estimate!, 1, 'metric')).toBe('260 W, estimated')
    expect(curveCell(model, estimate!, 0, 'metric')).toBe('310 W')
    const floor = yearCurvesModel('ride', {
      ...curves([[1], [], []]),
      years: curves([[1], [], []]).years.map((year) => Object.assign({}, year, { hard: false })),
    })!
    expect(curveCell(floor, floor.lines[0]!, 1, 'metric')).toBe('At least 250 W, estimated')
  })
})

describe('many years', () => {
  /** n years of a ride, the best in the middle year. */
  const years = (n: number): SportYearCurves => ({
    durations: [300, 1200],
    years: Array.from({ length: n }, (_, i) => ({
      year: 2010 + i,
      values: [300 - Math.abs(i - 3) * 5, 250 - Math.abs(i - 3) * 5],
      hard: true,
      estimated: [],
    })),
  })

  it('is crowded past six years, and not at six', () => {
    expect(isCrowded(yearCurvesModel('ride', years(6))!)).toBe(false)
    expect(isCrowded(yearCurvesModel('ride', years(7))!)).toBe(true)
  })

  it('names only the newest and the best year up to six years', () => {
    const model = yearCurvesModel('ride', years(6))!
    expect(namedYears(model)).toEqual([2013, 2015])
    expect(labelledYears(model)).toEqual([2013, 2015])
  })

  it('puts four years in colour past six: the newest, the best and the two newest others', () => {
    const model = yearCurvesModel('ride', years(10))!
    expect(model.bestYear).toBe(2013)
    expect(namedYears(model)).toEqual([2013, 2019])
    expect(labelledYears(model)).toEqual([2013, 2017, 2018, 2019])
  })

  it('puts four in colour when the newest year is the best, too', () => {
    const rising: SportYearCurves = {
      durations: [1200],
      years: Array.from({ length: 8 }, (_, i) => ({
        year: 2010 + i,
        values: [200 + i],
        hard: true,
        estimated: [],
      })),
    }
    const model = yearCurvesModel('ride', rising)!
    expect(namedYears(model)).toEqual([2017])
    expect(labelledYears(model)).toEqual([2014, 2015, 2016, 2017])
  })
})
