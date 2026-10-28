import { describe, expect, it } from 'vitest'
import { digestActivity } from '../digest/digestActivity'
import { MODEL_REVISION } from '../digest/modelRevision'
import type { ActivityDigest, Activity, AthleteSettings, Sport } from '../types'
import { recordHolders } from './holders'

const settings: AthleteSettings = { massKg: 70, bikeMassKg: 9 }

/** A flat 4 m/s activity of 2501 s, digested once; tests override the parts they need. */
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

/** A run digest with the given value at each duration, and optional distance bests. */
function run(
  id: string,
  startMs: number,
  values: Record<number, number>,
  distanceBests?: ActivityDigest['distanceBests'],
): ActivityDigest {
  const digest = digestActivity({ ...base('run'), id, startMs })
  return {
    ...digest,
    curve: digest.curve.map((p) => Object.assign(p, { value: values[p.durationS] ?? NaN })),
    distanceBests,
  }
}

/** A ride digest with measured power (watts) at each duration, which needs no bike model. */
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

describe('recordHolders', () => {
  it('gives each duration best to the activity with the highest value', () => {
    const digests = [run('a', 1, { 300: 4.0 }), run('b', 2, { 300: 5.0 })]
    const held = recordHolders(digests, settings)
    expect(held.get('b')).toEqual([{ kind: 'duration', durationS: 300 }])
    expect(held.has('a')).toBe(false)
  })

  it('gives a tie to the earlier activity, whatever order the digests arrive in', () => {
    const early = run('early', 1000, { 300: 4.5 })
    const late = run('late', 2000, { 300: 4.5 })
    expect(recordHolders([late, early], settings).has('early')).toBe(true)
    expect(recordHolders([early, late], settings).has('late')).toBe(false)
  })

  it('gives a distance best to the fastest time over that distance', () => {
    const digests = [
      run('slow', 1, {}, [{ distanceM: 1000, seconds: 250 }]),
      run('fast', 2, {}, [
        { distanceM: 1000, seconds: 240 },
        { distanceM: 5000, seconds: 1250 },
      ]),
    ]
    const held = recordHolders(digests, settings)
    expect(held.get('fast')).toEqual([
      { kind: 'distance', distanceM: 1000 },
      { kind: 'distance', distanceM: 5000 },
    ])
    expect(held.has('slow')).toBe(false)
  })

  it('gives a distance tie to the earlier activity', () => {
    const digests = [
      run('later', 2, {}, [{ distanceM: 5000, seconds: 1200 }]),
      run('earlier', 1, {}, [{ distanceM: 5000, seconds: 1200 }]),
    ]
    expect(recordHolders(digests, settings).has('earlier')).toBe(true)
    expect(recordHolders(digests, settings).has('later')).toBe(false)
  })

  it('lets one activity hold several records, durations first, then distances', () => {
    const d = run('one', 1, { 300: 5, 1200: 4 }, [{ distanceM: 1000, seconds: 240 }])
    expect(recordHolders([d], settings).get('one')).toEqual([
      { kind: 'duration', durationS: 300 },
      { kind: 'duration', durationS: 1200 },
      { kind: 'distance', distanceM: 1000 },
    ])
  })

  it('skips a digest with no value at a duration', () => {
    const older = run('older', 1, { 300: NaN })
    expect(recordHolders([older], settings).size).toBe(0)
  })

  it('compares runs with runs and rides with rides, never a W/kg with watts', () => {
    const digests = [run('runner', 1, { 300: 5 }), ride('cyclist', 2, { 300: 300 })]
    const held = recordHolders(digests, settings)
    expect(held.get('runner')).toEqual([{ kind: 'duration', durationS: 300 }])
    expect(held.get('cyclist')).toEqual([{ kind: 'duration', durationS: 300 }])
  })

  it('never gives a ride a distance record', () => {
    const digests = [ride('cyclist', 1, {})]
    expect(recordHolders(digests, settings).size).toBe(0)
  })

  it('ignores digests from an older model revision', () => {
    const stale = { ...run('stale', 1, { 300: 9 }), modelRevision: MODEL_REVISION - 1 }
    const current = run('current', 2, { 300: 4 })
    const held = recordHolders([stale, current], settings)
    expect(held.get('current')).toEqual([{ kind: 'duration', durationS: 300 }])
    expect(held.has('stale')).toBe(false)
  })

  it('finds a duration in a curve that is not in the usual order', () => {
    const usual = [run('a', 1, { 300: 4.0, 1200: 3.5 }), run('b', 2, { 300: 5.0, 1200: 3.0 })]
    const shuffled = usual.map((digest) => ({ ...digest, curve: [...digest.curve].reverse() }))
    expect(recordHolders(shuffled, settings)).toEqual(recordHolders(usual, settings))
    expect(recordHolders(usual, settings).get('b')).toEqual([{ kind: 'duration', durationS: 300 }])
  })

  it('returns an empty map for an empty library', () => {
    expect(recordHolders([], settings).size).toBe(0)
  })
})
