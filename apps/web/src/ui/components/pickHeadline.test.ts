import { describe, expect, it } from 'vitest'
import type { Comparison } from '@rca/core/types'
import { comparisonPoint, interval, makeActivity, makeResult } from './fixtures'
import { headlinePick, headlineShortfall, pickHeadline } from './pickHeadline'

describe('pickHeadline', () => {
  it('returns null when there are no comparison points', () => {
    const comparison: Comparison = { prior: [], calibrated: null }
    expect(pickHeadline(comparison)).toBeNull()
  })

  it('uses the 1200 s point when it is present', () => {
    const prior = [
      comparisonPoint({ durationS: 600 }),
      comparisonPoint({ durationS: 1200 }),
      comparisonPoint({ durationS: 1800 }),
    ]
    const pick = pickHeadline({ prior, calibrated: null })
    expect(pick?.point.durationS).toBe(1200)
    expect(pick?.point).toBe(prior[1])
  })

  it('reports uncalibrated when there is no heart-rate comparison', () => {
    const pick = pickHeadline({ prior: [comparisonPoint()], calibrated: null })
    expect(pick?.calibrated).toBe(false)
  })

  it('prefers the calibrated comparison when it is available', () => {
    const prior = [comparisonPoint({ ratio: interval(0.9, 1.0, 1.1) })]
    const calibrated = [comparisonPoint({ ratio: interval(1.05, 1.12, 1.2) })]
    const pick = pickHeadline({ prior, calibrated })
    expect(pick?.calibrated).toBe(true)
    expect(pick?.point).toBe(calibrated[0])
  })

  it('falls back to the duration closest to 1200 s on a log scale', () => {
    // Linear distance would pick 700 s (500 away against 700 away). Log distance picks 1900 s.
    const prior = [comparisonPoint({ durationS: 700 }), comparisonPoint({ durationS: 1900 })]
    expect(pickHeadline({ prior, calibrated: null })?.point.durationS).toBe(1900)
  })

  it('picks the nearest available duration when 1200 s is missing', () => {
    const prior = [
      comparisonPoint({ durationS: 300 }),
      comparisonPoint({ durationS: 900 }),
      comparisonPoint({ durationS: 3600 }),
    ]
    expect(pickHeadline({ prior, calibrated: null })?.point.durationS).toBe(900)
  })
})

describe('headlinePick', () => {
  const short = [{ durationS: 300, value: 6, activityId: 'a', startIndex: 0 }]
  const long = [...short, { durationS: 1200, value: 5, activityId: 'a', startIndex: 0 }]
  const result = (overrides: Parameters<typeof makeResult>[0]) =>
    makeResult({ runCp: null, rideCp: null, runCurve: long, rideCurve: long, ...overrides })

  it('picks the headline when each sport has a 20 min effort', () => {
    expect(headlinePick(result({}))?.point.durationS).toBe(1200)
  })

  it('picks the headline when a sport has a fitted threshold and no 20 min effort', () => {
    const fitted = result({ rideCurve: short, rideCp: makeResult().rideCp })
    expect(headlinePick(fitted)).not.toBeNull()
  })

  it('is null when one sport is known only from shorter efforts, however the comparison reads', () => {
    const thin = result({ rideCurve: short })
    expect(pickHeadline(thin.comparison)).not.toBeNull()
    expect(headlinePick(thin)).toBeNull()
    expect(headlinePick(result({ runCurve: short }))).toBeNull()
  })

  it('does not count an effort with no value as evidence', () => {
    const blank = [{ durationS: 1200, value: Number.NaN, activityId: null, startIndex: -1 }]
    expect(headlinePick(result({ rideCurve: blank }))).toBeNull()
  })
})

describe('headlinePick with few activities in the period', () => {
  const curve = [{ durationS: 1200, value: 5, activityId: 'a', startIndex: 0 }]
  const sports = (runs: number, rides: number, indoorRuns = 0) => [
    ...Array.from({ length: runs }, (_, n) => makeActivity({ id: `run-${n}`, sport: 'run' })),
    ...Array.from({ length: indoorRuns }, (_, n) =>
      makeActivity({ id: `tread-${n}`, sport: 'run', indoor: true }),
    ),
    ...Array.from({ length: rides }, (_, n) => makeActivity({ id: `ride-${n}`, sport: 'ride' })),
  ]
  const result = (activities: ReturnType<typeof sports>) =>
    makeResult({ activities, runCurve: curve, rideCurve: curve })

  it('holds a week of one run and three rides, and says the run needs two more', () => {
    const week = result(sports(1, 3))
    expect(headlinePick(week)).toBeNull()
    expect(headlineShortfall(week.activities)).toEqual({ run: 2, ride: 0 })
  })

  it('holds a day of one run and one ride', () => {
    const day = result(sports(1, 1))
    expect(headlinePick(day)).toBeNull()
    expect(headlineShortfall(day.activities)).toEqual({ run: 2, ride: 2 })
  })

  it('picks the headline from three of each', () => {
    expect(headlinePick(result(sports(3, 3)))?.point.durationS).toBe(1200)
  })

  it('does not count a treadmill run, which holds no best', () => {
    const only = result(sports(2, 3, 5))
    expect(headlinePick(only)).toBeNull()
    expect(headlineShortfall(only.activities)).toEqual({ run: 1, ride: 0 })
  })
})
