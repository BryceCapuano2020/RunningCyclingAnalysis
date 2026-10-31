import { describe, expect, it } from 'vitest'
import { DURATIONS_S } from '../constants'
import { digestActivity } from '../digest/digestActivity'
import type { Activity, ActivityDigest, AthleteSettings, Sport } from '../types'
import { recordHolders } from './holders'
import { effortProgression, recordAt, withoutOverreach } from './progression'
import type { Reading } from './progression'

const settings: AthleteSettings = { massKg: 70, bikeMassKg: 9 }

function base(sport: Sport): Activity {
  const n = 2501
  return {
    id: 'base',
    name: 'Base',
    sport,
    startMs: 0,
    n,
    speed: new Float64Array(n).fill(4),
    distance: Float64Array.from({ length: n }, (_, i) => 4 * i),
    altitude: new Float64Array(n).fill(100),
    heartRate: new Float64Array(n).fill(NaN),
    power: new Float64Array(n).fill(NaN),
    paused: new Uint8Array(n),
    hasPower: false,
    hasHeartRate: false,
    hasAltitude: true,
    indoor: false,
  }
}

function run(id: string, startMs: number, values: Record<number, number>): ActivityDigest {
  const digest = digestActivity({ ...base('run'), id, startMs })
  return {
    ...digest,
    curve: digest.curve.map((p) => Object.assign(p, { value: values[p.durationS] ?? NaN })),
  }
}

function ride(id: string, startMs: number, watts: Record<number, number>): ActivityDigest {
  const digest = digestActivity({ ...base('ride'), id, startMs, hasPower: true })
  return {
    ...digest,
    powerSource: 'measured',
    curve: digest.curve.map((p) =>
      Object.assign(p, { value: watts[p.durationS] ?? NaN, terms: null }),
    ),
  }
}

describe('effortProgression', () => {
  const digests = [
    run('r1', 1000, { 300: 4, 1200: 3.6 }),
    run('r2', 2000, { 300: 4.4, 1200: 3.5 }),
    run('r3', 3000, { 300: 4.2, 1200: 3.9 }),
    ride('b1', 1500, { 300: 250, 1200: 210 }),
    ride('b2', 2500, { 300: 240, 1200: 230 }),
  ]

  it('dates each activity that has a point at a duration, in the order given', () => {
    const progression = effortProgression(digests, settings)
    const at = DURATIONS_S.indexOf(300)
    expect(progression.run.readings[at]!.map((r) => [r.id, r.startMs])).toEqual([
      ['r1', 1000],
      ['r2', 2000],
      ['r3', 3000],
    ])
    expect(progression.ride.readings[at]!.map((r) => r.id)).toEqual(['b1', 'b2'])
  })

  it('reads a run at the durations asked for alone, the same readings there and none elsewhere; rides are read at every one', () => {
    const wanted = [DURATIONS_S.indexOf(300), DURATIONS_S.indexOf(1200)]
    const all = effortProgression(digests, settings)
    const some = effortProgression(digests, settings, undefined, wanted)
    for (const [index] of DURATIONS_S.entries()) {
      expect(some.run.readings[index]).toEqual(
        wanted.includes(index) ? all.run.readings[index] : [],
      )
    }
    expect(some.ride).toEqual(all.ride)
  })

  it('has the record holder as the highest reading at every duration, for runs and rides', () => {
    const progression = effortProgression(digests, settings)
    const held = recordHolders(digests, settings)
    for (const sport of ['run', 'ride'] as const) {
      for (const [index, durationS] of DURATIONS_S.entries()) {
        const top = progression[sport].readings[index]!.reduce<{
          id: string
          value: number
        } | null>((best, r) => (best === null || r.value > best.value ? r : best), null)
        if (top === null) continue
        expect(held.get(top.id)).toContainEqual({ kind: 'duration', durationS })
      }
    }
  })

  it('leaves out a treadmill run, as the records do', () => {
    const treadmill = { ...run('t', 4000, { 300: 9 }), indoor: true } as ActivityDigest
    const progression = effortProgression([...digests, treadmill], settings)
    const at = DURATIONS_S.indexOf(300)
    const held = recordHolders([...digests, treadmill], settings)
    const ids = progression.run.readings[at]!.map((r) => r.id)
    expect(held.has('t')).toBe(false)
    expect(ids).not.toContain('t')
  })
})

describe('estimates that stand alone', () => {
  const reading = (id: string, value: number, alone: boolean): Reading => ({
    id,
    startMs: 0,
    value,
    alone,
  })

  it('are left out of a history when they read higher than the record at the nearest shorter duration', () => {
    // 5 min record 4.0; at 10 min a measured 3.8 and an estimate on its own at 4.5: the estimate may not stand there.
    const history = withoutOverreach([
      [reading('measured5', 4, false)],
      [reading('measured10', 3.8, false), reading('estimate10', 4.5, true)],
      [reading('estimate20', 3.5, true)],
    ])
    expect(history[1]!.map((r) => r.id)).toEqual(['measured10'])
    // An estimate no higher than the shorter record stands, and the record at 10 min is the measured one.
    expect(history[2]!.map((r) => r.id)).toEqual(['estimate20'])
    expect(recordAt(history[1]!, 4)!.id).toBe('measured10')
  })

  it('agree with who holds the record: the highest reading of a history is the record holder', () => {
    const readings = [[reading('a', 4, false)], [reading('b', 3.8, false), reading('c', 4.5, true)]]
    const kept = withoutOverreach(readings)
    expect(recordAt(readings[1]!, 4)!.id).toBe(
      kept[1]!.reduce((x, y) => (y.value > x.value ? y : x)).id,
    )
  })

  it('say what the values are', () => {
    expect(effortProgression([], settings).run.unit).toBe('run W/kg')
    expect(effortProgression([], settings).ride.unit).toBe('W')
  })
})
