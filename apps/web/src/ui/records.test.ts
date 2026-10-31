import { afterEach, describe, expect, it, vi } from 'vitest'
import { fitCriticalPower } from '@rca/core/cp'
import { FLAT_RUN_COST, HALF_MARATHON_M, PRIORS, RESTING_W_PER_KG } from '@rca/core/constants'
import { metabolicToFlatSpeed } from '@rca/core/metabolic'
import { METRES_PER_KM, METRES_PER_MILE, formatDistance } from '@rca/core/units'
import { activityMasses } from './activityMasses'
import { curvePoint } from './charts/fixtures'
import { makeActivity, makeEquivalence, makeResult } from './components/fixtures'
import { thresholdRange } from './thresholdRange'
import { floorThreshold } from './thresholdFloor'
import { countEfforts, latestStartOf } from './records'
import {
  RECORD_DURATIONS_S,
  activityNames,
  calendarDaysBetween,
  chipLabels,
  countSport,
  curveOf,
  distanceRecords,
  effortLabel,
  EFFORT_OPTIONS,
  featuredEquivalence,
  isEstimatedRecord,
  nativeCurve,
  nativeValue,
  ownDistanceRecords,
  paceIsTime,
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

  it('reads a cycling threshold back in the watts its fit was made in', () => {
    // The fit works in metabolic W/kg at the prior-mean efficiency and the threshold converts back
    // with that same efficiency. The fit is linear, so the watts come back exactly, and the
    // threshold agrees with the cycling efforts it was fitted from.
    const massKg = 70
    const watts = (durationS: number) => 225 + 20000 / durationS
    const durations = [180, 300, 600, 1200]
    const metabolic = durations.map((durationS) =>
      curvePoint(durationS, watts(durationS) / (PRIORS.grossEfficiency.mean * massKg), 'ride-1'),
    )
    const rideCp = fitCriticalPower(metabolic)
    const result = makeResult({
      rideCp,
      rideCurve: durations.map((durationS) => curvePoint(durationS, watts(durationS), 'ride-1')),
    })
    expect(rideCp).not.toBeNull()
    expect(threshold(result, 'ride', massKg, 'metric')?.value).toBe('225 W')
  })
})

describe('thresholdRange', () => {
  it('calls a running threshold’s spread a fit spread, not a range, from the faster pace to the slower', () => {
    // The fixture’s critical power is 4.0 W/kg, with a standard error of 0.05 W/kg, and the model error floor widens it.
    expect(thresholdRange(makeResult(), 'run', 70, 'metric')).toBe('Fit spread 20:54 to 23:49 /km')
    expect(thresholdRange(makeResult(), 'run', 70, 'imperial')).toBe(
      'Fit spread 33:38 to 38:19 /mi',
    )
  })

  it('gives a cycling threshold’s fit spread in watts, from the lower to the higher', () => {
    expect(thresholdRange(makeResult(), 'ride', 75, 'metric')).toBe('Fit spread 48 to 52 W')
  })

  it('is null without a fit, and when the low end would not be a positive work rate', () => {
    expect(thresholdRange(makeResult({ runCp: null }), 'run', 70, 'metric')).toBeNull()
    expect(thresholdRange(makeResult({ rideCp: null }), 'ride', 70, 'metric')).toBeNull()
    const loose = makeResult({ runCp: { cp: 0.1, wPrime: 20, cpSe: 0.2, r2: 0.9, nPoints: 6 } })
    expect(thresholdRange(loose, 'run', 70, 'metric')).toBeNull()
  })

  it('is null when the low end would not be above resting metabolic rate, 1.22 W/kg', () => {
    // The low end is 1.2 W/kg, under the resting rate, so no range is said; 1.4 gives one above it.
    const below = { cp: 1.4, wPrime: 20, cpSe: 0.2, r2: 0.9, nPoints: 6 }
    expect(thresholdRange(makeResult({ runCp: below }), 'run', 70, 'metric')).toBeNull()
    const above = { cp: 1.6, wPrime: 20, cpSe: 0.2, r2: 0.9, nPoints: 6 }
    expect(thresholdRange(makeResult({ runCp: above }), 'run', 70, 'metric')).not.toBeNull()
  })

  it('is null for a ride whose fit draws on an effort with estimated watts', () => {
    const activities = [
      makeActivity({ id: 'ride-1', sport: 'ride', powerSource: 'virtual' }),
      makeActivity({ id: 'ride-2', sport: 'ride', powerSource: 'measured' }),
    ]
    const inWindow = [curvePoint(300, 3.0, 'ride-1'), curvePoint(1200, 2.8, 'ride-2')]
    expect(
      thresholdRange(makeResult({ activities, rideCurve: inWindow }), 'ride', 75, 'metric'),
    ).toBeNull()
  })

  it('gives a ride range when the estimated watts lie outside the fit’s window', () => {
    const activities = [
      makeActivity({ id: 'ride-1', sport: 'ride', powerSource: 'virtual' }),
      makeActivity({ id: 'ride-2', sport: 'ride', powerSource: 'measured' }),
    ]
    const outside = [curvePoint(3600, 2.5, 'ride-1'), curvePoint(600, 3.0, 'ride-2')]
    expect(
      thresholdRange(makeResult({ activities, rideCurve: outside }), 'ride', 75, 'metric'),
    ).toBe('Fit spread 48 to 52 W')
  })
})

describe('thresholdRange when both ends print the same', () => {
  it('says "About" and the one figure rather than "A to A", on either sport', () => {
    // The fit spread always carries a model error floor, so only a range between two fits can collapse: here the
    // second fit sits a hair above the main one, and neither end moves a displayed second or watt.
    const hair = (cp: number) => ({
      fit: { cp: cp + 1e-6, wPrime: 20, cpSe: 0.01, r2: 0.99, nPoints: 6 },
      leftOutS: [900],
      floor: cp - 0.5,
    })
    expect(thresholdRange(makeResult({ runCpUneven: hair(4.0) }), 'run', 70, 'metric')).toBe(
      'About 23:23 /km',
    )
    expect(thresholdRange(makeResult({ rideCpUneven: hair(3.0) }), 'ride', 75, 'metric')).toBe(
      'About 48 W',
    )
  })
})

describe('thresholdRange with an uneven fit', () => {
  // The floor is the lowest of the bests left out, 3.2 W/kg, which is 52 W for a 75 kg rider.
  const uneven = (cp: number, floor = 3.2) => ({
    fit: { cp, wPrime: 15, cpSe: 0.04, r2: 0.98, nPoints: 5 },
    leftOutS: [900, 1200],
    floor,
  })

  it('runs from the main threshold to the uneven one, from its faster end', () => {
    // The main fit is 4.0 W/kg and the uneven one 4.2, which is the faster pace, so it reads first.
    const result = makeResult({ runCpUneven: uneven(4.2) })
    expect(thresholdRange(result, 'run', 70, 'metric')).toBe('Range 21:49 to 23:23 /km')
  })

  it('runs from the main threshold to the uneven one in watts for a ride', () => {
    const result = makeResult({ rideCpUneven: uneven(3.6) })
    expect(thresholdRange(result, 'ride', 75, 'metric')).toBe('Range 48 to 58 W')
  })

  it('is shown for a ride whose fit draws on estimated watts, since the note says so', () => {
    const activities = [
      makeActivity({ id: 'ride-1', sport: 'ride', powerSource: 'virtual' }),
      makeActivity({ id: 'ride-2', sport: 'ride', powerSource: 'measured' }),
    ]
    const inWindow = [curvePoint(300, 3.0, 'ride-1'), curvePoint(1200, 2.8, 'ride-2')]
    const result = makeResult({ activities, rideCurve: inWindow, rideCpUneven: uneven(3.6) })
    expect(thresholdRange(result, 'ride', 75, 'metric')).toBe('Range 48 to 58 W')
  })

  it('starts from the floor when the main threshold is refused, so the range still shows', () => {
    const result = makeResult({ rideCp: null, rideCpRefusal: 'shape', rideCpUneven: uneven(3.6) })
    expect(thresholdRange(result, 'ride', 75, 'metric')).toBe('Range 52 to 58 W')
  })

  it('is null when the uneven threshold does not sit above its floor', () => {
    const result = makeResult({ rideCp: null, rideCpUneven: uneven(3.0, 3.2) })
    expect(thresholdRange(result, 'ride', 75, 'metric')).toBeNull()
  })
})

describe('floorThreshold', () => {
  const uneven = {
    fit: { cp: 3.6, wPrime: 15, cpSe: 0.04, r2: 0.98, nPoints: 5 },
    leftOutS: [900, 1200],
    floor: 3.2,
  }

  it('is the floor in the sport’s figure, when the main threshold is refused', () => {
    const result = makeResult({ rideCp: null, rideCpRefusal: 'shape', rideCpUneven: uneven })
    const figure = floorThreshold(result, 'ride', 75, 'metric')
    expect(figure?.value).toBe('52 W')
    expect(figure?.sub).toMatch(/W\/kg/)
  })

  it('is null while the main threshold is there, or when no uneven fit set a floor', () => {
    expect(floorThreshold(makeResult({ rideCpUneven: uneven }), 'ride', 75, 'metric')).toBeNull()
    expect(floorThreshold(makeResult({ rideCp: null }), 'ride', 75, 'metric')).toBeNull()
  })

  it('is null when the floor is not below the fit, so a figure never stands without its range', () => {
    const level = { ...uneven, floor: uneven.fit.cp }
    const result = makeResult({ rideCp: null, rideCpRefusal: 'shape', rideCpUneven: level })
    expect(floorThreshold(result, 'ride', 75, 'metric')).toBeNull()
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
    expect(RECORD_DURATIONS_S.ride).toEqual([60, 300, 1200, 3600])
  })

  it('lists no run record shorter than 5 minutes, since grade-adjusted short windows follow the slope', () => {
    const run = makeActivity({ id: 'run-1', sport: 'run', name: 'Morning run' })
    const runs = makeResult({
      activities: [run],
      runCurve: [
        curvePoint(60, 20, 'run-1'),
        curvePoint(180, 18, 'run-1'),
        curvePoint(300, 17, 'run-1'),
        curvePoint(1200, 15, 'run-1'),
        curvePoint(3600, 13, 'run-1'),
      ],
    })
    expect(sportRecords(runs, 'run', 70, 'metric').map((r) => r.durationS)).toEqual([
      300, 1200, 3600,
    ])
    expect(RECORD_DURATIONS_S.run).toEqual([300, 1200, 3600])
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

  it('prices a ride at the body mass on its own date when masses are dated', () => {
    const heavier = makeActivity({ id: 'ride-1', sport: 'ride', massKg: 100 })
    const dated = makeResult({ activities: [heavier], rideCurve: result.rideCurve })
    // 400 W at 100 kg is 4.0 W/kg, whatever the current mass.
    expect(sportRecords(dated, 'ride', 80, 'metric')[0]?.sub).toBe('4.0 W/kg')
    expect(activityMasses([heavier, ride])).toEqual({ 'ride-1': 100 })
  })

  it('shows runs as a pace with no second reading', () => {
    const runs = makeResult({ runCurve: [curvePoint(1200, 15, 'run-1')] })
    const [first] = sportRecords(runs, 'run', 70, 'imperial')
    expect(first?.value).toMatch(/\/mi$/)
    expect(first?.sub).toBeNull()
  })

  it('says how far a run covered in its duration, at its flat pace, in the unit preference', () => {
    const runs = makeResult({ runCurve: [curvePoint(1200, 15, 'run-1')] })
    const [first] = sportRecords(runs, 'run', 70, 'imperial')
    const covered = formatDistance(metabolicToFlatSpeed(15) * 1200, 'imperial')
    expect(first?.covered).toBe(`${covered} in 20 min`)
    expect(first?.covered).toMatch(/^\d+\.\d mi in 20 min$/)
  })

  it('names an hour effort in minutes in its distance covered, as the records list does', () => {
    const runs = makeResult({ runCurve: [curvePoint(3600, 15, 'run-1')] })
    const [hour] = sportRecords(runs, 'run', 70, 'metric')
    expect(hour?.covered).toMatch(/^\d+\.\d km in 60 min$/)
  })

  it('gives a ride no distance covered, since its grade goes through the running equivalent', () => {
    const [first] = sportRecords(result, 'ride', 70, 'metric')
    expect(first?.covered).toBeNull()
  })
})

describe('calendar days from today', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('counts whole calendar days between two moments, across a clock change', () => {
    const day = new Date(2026, 2, 28, 23).getTime()
    expect(calendarDaysBetween(day, new Date(2026, 2, 29, 1).getTime())).toBe(1)
    expect(calendarDaysBetween(day, new Date(2026, 3, 4, 0, 30).getTime())).toBe(7)
    expect(calendarDaysBetween(day, new Date(2026, 2, 28, 1).getTime())).toBe(0)
  })

  it('counts a 23 hour day as a whole day, whatever zone the suite runs in', () => {
    // Santiago's clocks go forward at midnight on this Sunday, so the day is 23 hours long and the
    // gap from its start to the next day's start is 23 hours. A count of whole days from elapsed time
    // would call it none.
    vi.stubEnv('TZ', 'America/Santiago')
    const sunday = new Date(2026, 8, 6, 12).getTime()
    expect(calendarDaysBetween(sunday, new Date(2026, 8, 7, 12).getTime())).toBe(1)
  })
})

describe('countSport', () => {
  it('counts activities of one sport', () => {
    const { activities } = makeResult()
    expect(countSport(activities, 'run')).toBe(3)
    expect(countSport(activities, 'ride')).toBe(3)
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

  it('keeps the window a running value came from, so the chart can tell a carried value from a measured one', () => {
    const wkg = RESTS_ON_ONE
    const curves = {
      runCurve: [
        { ...curvePoint(1200, wkg, 'run-1'), windowS: 1200 },
        { ...curvePoint(1800, wkg, 'run-1'), windowS: 3600 },
        curvePoint(3600, wkg, 'run-1'),
      ],
      rideCurve: [],
    }
    expect(nativeCurve('run', curves).map((point) => point.windowS)).toEqual([
      1200,
      3600,
      undefined,
    ])
  })
})

const RESTS_ON_ONE = RESTING_W_PER_KG + FLAT_RUN_COST * 3

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

describe('distanceRecords', () => {
  const runBests = (id: string, startMs: number, seconds: { 1000?: number; 5000?: number }) =>
    makeActivity({
      id,
      startMs,
      distanceBests: Object.entries(seconds).map(([distanceM, secs]) => ({
        distanceM: Number(distanceM),
        seconds: secs,
      })),
    })

  it('takes the fastest time at each record distance, with the activity that set it', () => {
    const slow = runBests('slow', 1, { 1000: 250, 5000: 1250 })
    const fast = runBests('fast', 2, { 1000: 240 })
    const { records, partial } = distanceRecords([fast, slow], 'metric')
    expect(partial).toBe(false)
    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({ label: '1 km', seconds: 240, time: '4:00', activity: fast })
    expect(records[0]?.pace).toBe('4:00 /km')
    expect(records[1]).toMatchObject({
      label: '5 km',
      seconds: 1250,
      time: '20:50',
      activity: slow,
    })
  })

  it('gives a tie to the earlier activity, whatever order they come in', () => {
    const early = runBests('early', 1, { 1000: 240 })
    const late = runBests('late', 2, { 1000: 240 })
    expect(distanceRecords([late, early], 'metric').records[0]?.activity.id).toBe('early')
    expect(distanceRecords([early, late], 'metric').records[0]?.activity.id).toBe('early')
  })

  it('names the half marathon, and gives its pace in the unit preference', () => {
    const run = makeActivity({
      id: 'half',
      startMs: 1,
      distanceBests: [{ distanceM: 21097.5, seconds: 5274 }],
    })
    const [half] = distanceRecords([run], 'metric').records
    expect(half).toMatchObject({ label: 'half marathon', time: '1:27:54' })
    expect(half?.pace).toBe('4:10 /km')
    expect(distanceRecords([run], 'imperial').records[0]?.pace).toBe('6:42 /mi')
  })

  it('shows its paces in the unit preference', () => {
    const run = runBests('run', 1, { 1000: 240 })
    expect(distanceRecords([run], 'imperial').records[0]?.pace).toBe('6:26 /mi')
  })

  it('is partial when some runs in scope predate distance bests', () => {
    const current = runBests('current', 2, { 1000: 240 })
    const older = makeActivity({ id: 'older', startMs: 1 })
    expect(distanceRecords([current, older], 'metric').partial).toBe(true)
  })

  it('shows nothing when no run in scope has distance bests, and ignores rides', () => {
    const older = makeActivity({ id: 'older', startMs: 1 })
    const ride = makeActivity({ id: 'ride', sport: 'ride', startMs: 2 })
    expect(distanceRecords([older, ride], 'metric')).toEqual({ records: [], partial: false })
  })
})

describe('paceIsTime', () => {
  it('is true for the mile in imperial and the kilometre in metric, whose pace is their time', () => {
    expect(paceIsTime(METRES_PER_MILE, 'imperial')).toBe(true)
    expect(paceIsTime(METRES_PER_KM, 'metric')).toBe(true)
  })

  it('is false for the other unit’s distance, and for any other distance', () => {
    expect(paceIsTime(METRES_PER_KM, 'imperial')).toBe(false)
    expect(paceIsTime(METRES_PER_MILE, 'metric')).toBe(false)
    expect(paceIsTime(5000, 'metric')).toBe(false)
  })
})

describe('chipLabels', () => {
  it('names duration bests of 5 and 20 minutes, 60 minutes and every run distance', () => {
    expect(
      chipLabels([
        { kind: 'duration', durationS: 300 },
        { kind: 'duration', durationS: 1200 },
        { kind: 'duration', durationS: 3600 },
        { kind: 'distance', distanceM: 1609.344 },
        { kind: 'distance', distanceM: 10000 },
        { kind: 'distance', distanceM: 21097.5 },
      ]),
    ).toEqual([
      'Best 5 min',
      'Best 20 min',
      'Best 60 min',
      'Best 1 mi',
      'Best 10 km',
      'Best half marathon',
    ])
  })

  it('leaves out the one-minute best, which is on the page only', () => {
    expect(chipLabels([{ kind: 'duration', durationS: 60 }])).toEqual([])
  })

  it('is empty for an activity that holds nothing', () => {
    expect(chipLabels([])).toEqual([])
  })
})

describe('isEstimatedRecord', () => {
  const ride = (powerSource: 'measured' | 'virtual' | 'none') =>
    makeActivity({ id: 'ride', sport: 'ride', powerSource })

  it('counts a ride whose watts came from virtual power as estimated', () => {
    expect(isEstimatedRecord('ride', ride('virtual'))).toBe(true)
  })

  it('counts a ride with no power source as estimated, as it counts one with no power meter', () => {
    expect(isEstimatedRecord('ride', ride('none'))).toBe(true)
  })

  it('does not count a ride whose watts were measured by a power meter', () => {
    expect(isEstimatedRecord('ride', ride('measured'))).toBe(false)
  })

  it('counts a ride estimated when the activity that set it is not in the result', () => {
    expect(isEstimatedRecord('ride', null)).toBe(true)
  })

  it('never tags a run, whatever its activity or power source', () => {
    expect(isEstimatedRecord('run', makeActivity({ sport: 'run', powerSource: 'virtual' }))).toBe(
      false,
    )
    expect(isEstimatedRecord('run', null)).toBe(false)
  })
})

describe('effortLabel', () => {
  it('names every record length in minutes, the hour too, as DESIGN names them', () => {
    expect(effortLabel(3600)).toBe('60 min')
    expect(effortLabel(1200)).toBe('20 min')
    expect(effortLabel(300)).toBe('5 min')
    expect(effortLabel(60)).toBe('1 min')
  })

  it('names a length under a minute in seconds, not as a fraction of a minute', () => {
    expect(effortLabel(45)).toBe('45 s')
  })
})

describe('the half marathon as a run record', () => {
  it('names it in chips and in the list of an activity', () => {
    expect(chipLabels([{ kind: 'distance', distanceM: HALF_MARATHON_M }])).toEqual([
      'Best half marathon',
    ])
    const run = makeActivity({
      id: 'half',
      distanceBests: [{ distanceM: HALF_MARATHON_M, seconds: 5400 }],
    })
    expect(ownDistanceRecords(run, 'metric').map((record) => record.label)).toEqual([
      'half marathon',
    ])
  })

  it('lists an activity its own distance bests, and none for a ride', () => {
    const run = makeActivity({
      id: 'run',
      distanceBests: [
        { distanceM: 1000, seconds: 250 },
        { distanceM: 5000, seconds: 1300 },
      ],
    })
    expect(ownDistanceRecords(run, 'metric').map((record) => record.time)).toEqual([
      '4:10',
      '21:40',
    ])
    expect(ownDistanceRecords(makeActivity({ sport: 'ride' }), 'metric')).toEqual([])
  })
})

describe('effortLabel', () => {
  it('names each effort length in minutes, the same way the trend’s segment control does', () => {
    expect(effortLabel(1200)).toBe('20 min')
    expect(effortLabel(3600)).toBe('60 min')
    expect(EFFORT_OPTIONS.map((option) => option.label)).toEqual(
      EFFORT_OPTIONS.map((option) => effortLabel(Number(option.value))),
    )
  })
})

describe('latestStartOf and countEfforts', () => {
  it('takes the latest start of a sport whatever its length, so a short run counts as the latest', () => {
    const activities = [
      makeActivity({
        id: 'run-long',
        sport: 'run',
        startMs: Date.UTC(2025, 0, 20),
        durationS: 3600,
      }),
      makeActivity({
        id: 'run-short',
        sport: 'run',
        startMs: Date.UTC(2025, 0, 29),
        durationS: 600,
      }),
    ]
    expect(latestStartOf(activities, 'run')).toBe(Date.UTC(2025, 0, 29))
    expect(latestStartOf(activities, 'ride')).toBeNull()
  })

  it('counts only the activities of a sport as long as the headline effort, since a shorter one rests on less', () => {
    const activities = [
      makeActivity({ id: 'run-1', sport: 'run', durationS: 1200 }),
      makeActivity({ id: 'run-2', sport: 'run', durationS: 600 }),
      makeActivity({ id: 'run-3', sport: 'run', durationS: 900 }),
      makeActivity({ id: 'ride-1', sport: 'ride', durationS: 3600 }),
    ]
    expect(countEfforts(activities, 'run')).toBe(1)
    expect(countEfforts(activities, 'ride')).toBe(1)
  })
})
