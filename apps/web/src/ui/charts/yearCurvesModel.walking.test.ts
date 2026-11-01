import { describe, expect, it } from 'vitest'
import { WALKING_PACE } from '@rca/core/constants'
import type { SportYearCurves } from '@rca/core/history'
import { yearCurvesModel } from './yearCurvesModel'

const WALK = WALKING_PACE.maxMovingSpeedMs - 0.3

/** Four durations: 5 and 20 minutes, 2 and 3 hours. A year's value at 3 hours can be a walk's. */
const durations = [300, 1200, 7200, 10_800]

const year = (n: number, values: (number | null)[]) => ({
  year: 2020 + n,
  values,
  hard: true,
  estimated: [],
})

describe('a run curve by year at walking pace', () => {
  const curves: SportYearCurves = {
    durations,
    years: [
      year(0, [4.4, 3.9, 3.0, null]),
      year(1, [4.6, 4.1, 3.2, WALK]),
      year(2, [4.5, 4.0, WALK, WALK - 0.4]),
    ],
  }

  it('stops each year at its longest duration that is not a walk', () => {
    const model = yearCurvesModel('run', curves)!
    expect(model.durations).toEqual([300, 1200, 7200])
    expect(model.lines.map((line) => line.values)).toEqual([
      [4.4, 3.9, 3.0],
      [4.6, 4.1, 3.2],
      [4.5, 4.0, null],
    ])
  })

  it('draws a ride at every duration, whatever its power', () => {
    const ride: SportYearCurves = {
      durations,
      years: [year(0, [300, 250, 120, 40]), year(1, [310, 260, 130, 50])],
    }
    const model = yearCurvesModel('ride', ride)!
    expect(model.durations).toEqual(durations)
    expect(model.lines[1]!.values).toEqual([310, 260, 130, 50])
  })

  it('leaves out a year that never gets above walking pace, and counts recency among the rest', () => {
    const model = yearCurvesModel('run', {
      durations,
      years: [
        year(0, [WALK, WALK, null, null]),
        year(1, [4.4, 3.9, 3.0, null]),
        year(2, [4.5, 4.0, 3.1, null]),
      ],
    })!
    expect(model.lines.map((line) => [line.year, line.recency])).toEqual([
      [2021, 0],
      [2022, 1],
    ])
    expect(model.latestYear).toBe(2022)
  })

  it('has no model when no year gets above walking pace', () => {
    expect(
      yearCurvesModel('run', { durations, years: [year(0, [WALK, WALK, WALK, WALK])] }),
    ).toBeNull()
  })

  it('does not change the curves it was given', () => {
    const before = JSON.stringify(curves)
    yearCurvesModel('run', curves)
    expect(JSON.stringify(curves)).toBe(before)
  })
})
