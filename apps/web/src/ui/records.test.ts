import { describe, expect, it } from 'vitest'
import { FLAT_RUN_COST, PRIORS, RESTING_W_PER_KG } from '@rca/core/constants'
import { curvePoint } from './charts/fixtures'
import { makeActivity, makeEquivalence, makeResult } from './components/fixtures'
import {
  RECORD_DURATIONS_S,
  activityNames,
  countSport,
  curveOf,
  featuredEquivalence,
  nativeCurve,
  nativeValue,
  sportRecords,
  threshold,
} from './records'

describe('threshold', () => {
  it('reads running threshold as a pace and cycling as watts with W/kg', () => {
    const result = makeResult()
    expect(threshold(result, 'run', 70, 'metric')?.value).toMatch(/^\d+:\d{2} \/km$/)
    const ride = threshold(result, 'ride', 70, 'metric')
    expect(ride?.value).toMatch(/^\d+ W$/)
    expect(ride?.sub).toMatch(/W\/kg$/)
  })

  it('is null without a critical-power fit', () => {
    const result = makeResult({ runCp: null, rideCp: null })
    expect(threshold(result, 'run', 70, 'metric')).toBeNull()
    expect(threshold(result, 'ride', 70, 'metric')).toBeNull()
  })
})

describe('sportRecords', () => {
  const ride = makeActivity({ id: 'ride-1', sport: 'ride', name: 'Hill ride' })
  const result = makeResult({
    activities: [ride],
    rideCurve: [
      curvePoint(60, 400, 'ride-1'),
      curvePoint(300, 300, 'gone'),
      curvePoint(1200, Number.NaN, null),
      curvePoint(3600, 210, 'ride-1'),
      curvePoint(600, 260, 'ride-1'),
    ],
  })

  it('lists only the record durations that have a value, in order', () => {
    expect(sportRecords(result, 'ride', 70, 'metric').map((r) => r.durationS)).toEqual([
      60, 300, 3600,
    ])
    expect(RECORD_DURATIONS_S).toEqual([60, 300, 1200, 3600])
  })

  it('names the activity that set each record, or null when it is not in the result', () => {
    const records = sportRecords(result, 'ride', 70, 'metric')
    expect(records[0]?.activity).toBe(ride)
    expect(records[1]?.activity).toBeNull()
  })

  it('shows rides in watts and W/kg', () => {
    const [first] = sportRecords(result, 'ride', 80, 'metric')
    expect(first?.value).toBe('400 W')
    expect(first?.sub).toBe('5.0 W/kg')
  })

  it('shows runs as a pace with no second reading', () => {
    const runs = makeResult({ runCurve: [curvePoint(1200, 15, 'run-1')] })
    const [first] = sportRecords(runs, 'run', 70, 'imperial')
    expect(first?.value).toMatch(/\/mi$/)
    expect(first?.sub).toBeNull()
  })
})

describe('countSport', () => {
  it('counts activities of one sport', () => {
    const { activities } = makeResult()
    expect(countSport(activities, 'run')).toBe(1)
    expect(countSport(activities, 'ride')).toBe(1)
  })
})

describe('featuredEquivalence', () => {
  it('features the 20 minute equivalence when there is one', () => {
    const twenty = makeEquivalence({ durationS: 1200, ridePowerW: 250 })
    const featured = featuredEquivalence([
      makeEquivalence({ durationS: 300 }),
      twenty,
      makeEquivalence({ durationS: 3600 }),
    ])
    expect(featured).toBe(twenty)
  })

  it('falls back to the longest equivalence below 20 minutes when there is no 20 minute one', () => {
    const featured = featuredEquivalence([
      makeEquivalence({ durationS: 300 }),
      makeEquivalence({ durationS: 900, ridePowerW: 280 }),
      makeEquivalence({ durationS: 3600 }),
    ])
    expect(featured?.durationS).toBe(900)
  })

  it('features the shortest longer equivalence when every one is longer than 20 minutes', () => {
    const featured = featuredEquivalence([
      makeEquivalence({ durationS: 1800 }),
      makeEquivalence({ durationS: 3600 }),
    ])
    expect(featured?.durationS).toBe(1800)
  })

  it('is null when there are no equivalences', () => {
    expect(featuredEquivalence([])).toBeNull()
  })
})

describe('nativeValue and nativeCurve', () => {
  it('reads a running value as the flat speed that costs it, and a cycling value as watts', () => {
    const wkg = RESTING_W_PER_KG + FLAT_RUN_COST * 4
    expect(nativeValue('run', wkg, 75)).toBeCloseTo(4, 9)
    expect(nativeValue('ride', 250 / (PRIORS.grossEfficiency.mean * 75), 75)).toBeCloseTo(250, 9)
  })

  it('gives a running curve in speed, and a cycling curve as it already is, in watts', () => {
    const curves = {
      runCurve: [curvePoint(1200, RESTING_W_PER_KG + FLAT_RUN_COST * 4, 'run-1')],
      rideCurve: [curvePoint(1200, 250, 'ride-1')],
    }
    const [run] = nativeCurve('run', curves)
    expect(run?.value).toBeCloseTo(4, 9)
    expect(run?.activityId).toBe('run-1')
    expect(nativeCurve('ride', curves)).toBe(curves.rideCurve)
  })
})

describe('activityNames', () => {
  it('names each activity by its id', () => {
    const names = activityNames([
      makeActivity({ id: 'run-1', name: 'Morning run' }),
      makeActivity({ id: 'ride-1', name: 'Hill ride' }),
    ])
    expect(names).toEqual({ 'run-1': 'Morning run', 'ride-1': 'Hill ride' })
  })
})

describe('figures with their number and unit', () => {
  it('splits a threshold into the number and the unit it is read in', () => {
    const run = threshold(makeResult(), 'run', 70, 'imperial')
    expect(run?.number).toMatch(/^\d+:\d{2}$/)
    expect(run?.unit).toBe('/mi')
    expect(run?.value).toBe(`${run?.number} ${run?.unit}`)
    const ride = threshold(makeResult(), 'ride', 70, 'metric')
    expect(ride?.number).toMatch(/^\d+$/)
    expect(ride?.unit).toBe('W')
    expect(ride?.value).toBe(`${ride?.number} W`)
  })

  it('splits a record into the number and the unit it is read in', () => {
    const ride = makeActivity({ id: 'ride-1', sport: 'ride' })
    const result = makeResult({ activities: [ride], rideCurve: [curvePoint(60, 400, 'ride-1')] })
    const [first] = sportRecords(result, 'ride', 80, 'metric')
    expect(first?.number).toBe('400')
    expect(first?.unit).toBe('W')
    expect(first?.value).toBe('400 W')
  })
})

describe('curveOf', () => {
  it('is the curve each sport records from', () => {
    const result = makeResult({
      runCurve: [curvePoint(60, 17, 'run-1')],
      rideCurve: [curvePoint(60, 400, 'ride-1')],
    })
    expect(curveOf(result, 'run')).toBe(result.runCurve)
    expect(curveOf(result, 'ride')).toBe(result.rideCurve)
  })
})
