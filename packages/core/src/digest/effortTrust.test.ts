import { describe, expect, it } from 'vitest'
import { recordHolders } from '../records'
import type { ActivityDigest, AthleteSettings, Sport } from '../types'
import { combine, sportCurves } from './combine'
import { digestActivity } from './digestActivity'
import { periodDurability } from './durabilityPeriod'
import { driftTrend } from './driftTrend'
import { effortsCount } from './effortTrust'
import { lateEvidence } from './lateEvidence'
import { MEASURED_EFFORT } from '../hr/setAside'
import { massesOf } from './masses'
import { heartRatePoints } from './rideCurves'
import { fitnessTrend } from './trend'
import { syntheticActivity } from './test/syntheticActivity'

const settings: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const DAY = 86_400_000

/** A 30 minute run digest at a steady speed, indoors or out, with the given distance bests. */
function runAt(id: string, startMs: number, speed: number, indoor: boolean): ActivityDigest {
  const n = 1800
  const digest = digestActivity(
    syntheticActivity({ id, startMs, n, indoor, speed: new Float64Array(n).fill(speed) }),
  )
  return { ...digest, distanceBests: [{ distanceM: 5000, seconds: Math.round(5000 / speed) }] }
}

/** A 30 minute ride digest with a power meter at a steady wattage. */
function rideAt(id: string, startMs: number, watts: number, indoor: boolean): ActivityDigest {
  const n = 1800
  return digestActivity(
    syntheticActivity({
      id,
      startMs,
      n,
      sport: 'ride',
      indoor,
      speed: new Float64Array(n).fill(8),
      power: new Float64Array(n).fill(watts),
    }),
  )
}

/** The outdoor run is slow and the treadmill run is faster, so the treadmill would hold every best. */
const outdoor = runAt('outdoor', 0, 3.5, false)
const treadmill = runAt('treadmill', DAY, 4.5, true)

describe('effortsCount', () => {
  it('keeps every outdoor activity and a trainer ride, and drops only a treadmill run', () => {
    const cases: [Sport, boolean, boolean][] = [
      ['run', false, true],
      ['run', true, false],
      ['ride', false, true],
      ['ride', true, true],
    ]
    for (const [sport, indoor, counts] of cases) {
      expect(effortsCount({ sport, indoor })).toBe(counts)
    }
  })
})

describe('a treadmill run holds no best', () => {
  it('leaves its faster pace out of the run curve, so the outdoor run holds every point', () => {
    const result = combine([outdoor, treadmill], settings)
    const held = result.runCurve.filter((p) => p.activityId !== null)
    expect(held.length).toBeGreaterThan(0)
    expect(held.every((p) => p.activityId === 'outdoor')).toBe(true)
    expect(held.map((p) => p.value)).toEqual(
      combine([outdoor], settings)
        .runCurve.filter((p) => p.activityId !== null)
        .map((p) => p.value),
    )
  })

  it('stays in the activity list, whose volume and time still count it', () => {
    const result = combine([outdoor, treadmill], settings)
    expect(result.activities.map((a) => a.id).sort()).toEqual(['outdoor', 'treadmill'])
    const summary = result.activities.find((a) => a.id === 'treadmill')
    expect(summary?.distanceM).toBeGreaterThan(0)
    expect(summary?.distanceBests).toEqual([{ distanceM: 5000, seconds: 1111 }])
  })

  it('gives no run curve at all when every run was on a treadmill', () => {
    const result = combine([treadmill], settings)
    expect(result.runCurve.every((p) => p.activityId === null)).toBe(true)
    expect(result.runCp).toBeNull()
  })

  it('leaves it out of the previous period’s curves too', () => {
    const curves = sportCurves([treadmill], settings, combine([], settings).bikeModel)
    expect(curves.runCurve.every((p) => p.activityId === null)).toBe(true)
  })

  it('holds no duration or distance record, so the outdoor run holds them all', () => {
    const held = recordHolders([outdoor, treadmill], settings)
    expect(held.has('treadmill')).toBe(false)
    expect(held.get('outdoor')).toContainEqual({ kind: 'distance', distanceM: 5000 })
    expect(held.get('outdoor')?.some((r) => r.kind === 'duration')).toBe(true)
  })

  it('is not a point of the weekly trend', () => {
    const trend = fitnessTrend([treadmill], settings)
    expect(trend.every((p) => p.runWkg === null)).toBe(true)
    const withOutdoor = fitnessTrend([outdoor, treadmill], settings)
    expect(withOutdoor.at(-1)?.runWkg).toBe(fitnessTrend([outdoor], settings).at(-1)?.runWkg)
  })

  it('does not count towards durability', () => {
    const rows = periodDurability([treadmill], 'run')
    expect(rows.every((row) => row.fresh === null)).toBe(true)
  })

  it('gives the heart-rate check no points, since treadmill pace is not a power', () => {
    const masses = massesOf(settings)
    const model = combine([], settings).bikeModel
    expect(heartRatePoints([outdoor], masses, model).runPoints.length).toBeGreaterThan(0)
    expect(heartRatePoints([treadmill], masses, model).runPoints).toEqual([])
  })
})

describe('one rule everywhere', () => {
  it('is the rule the heart-rate set-aside uses for a run’s pace', () => {
    expect(MEASURED_EFFORT.run(treadmill)).toBe(effortsCount(treadmill))
    expect(MEASURED_EFFORT.run(outdoor)).toBe(effortsCount(outdoor))
  })
})

describe('an indoor run’s drift and late bests are not read', () => {
  const drift = { firstRatio: 1, secondRatio: 0.9, durationS: 3600 }
  const withDrift = (digest: ActivityDigest): ActivityDigest => ({ ...digest, drift })

  it('leaves its drift out of the drift trend', () => {
    expect(
      driftTrend([withDrift(outdoor), withDrift(treadmill)], 'run').map((p) => p.activityId),
    ).toEqual(['outdoor'])
  })

  it('leaves its drift and its durability out of the late evidence', () => {
    const late = lateEvidence([withDrift(treadmill)], new Set())
    expect(late.run.drift).toEqual([])
    expect(late.run.durability.every((row) => row.fresh === null)).toBe(true)
    expect(lateEvidence([withDrift(outdoor)], new Set()).run.drift).toHaveLength(1)
  })
})

describe('a trainer ride still holds bests', () => {
  it('counts an indoor ride’s measured power in the ride curve and the records', () => {
    const trainer = rideAt('trainer', 0, 250, true)
    const result = combine([trainer], settings)
    expect(result.rideCurve.some((p) => p.activityId === 'trainer')).toBe(true)
    expect(recordHolders([trainer], settings).has('trainer')).toBe(true)
  })
})
