import { describe, expect, it } from 'vitest'
import { digestActivity } from '../digest/digestActivity'
import { syntheticActivity } from '../digest/test/syntheticActivity'
import { mulberry32 } from '../math'
import { assessQuality } from '../quality'
import type { Activity } from '../types'
import { activityTraceOf } from '../workbench/trace'
import type { ZoneMeasure } from './schemes'
import { activityTimeInZones } from './timeInZones'
import { traceTimeInZones } from './traceZones'
import { zonesFor } from './zones'
import type { ZoneSet } from './zones'

/** The seconds in each zone of the whole activity by the period view's way (the digest) and the activity page's (the trace). */
function bothWays(activity: Activity, measure: ZoneMeasure, reference: number) {
  const set: ZoneSet = {
    sport: activity.sport,
    measure,
    source: 'entered',
    reference,
    estimatedFrom: [],
    citation: '',
    zones: zonesFor(measure, reference),
  }
  const digest = digestActivity(activity)
  const counted = activityTimeInZones(digest, [set])[measure]
  const trace = activityTraceOf(activity, assessQuality(activity, []))
  const exact = traceTimeInZones(trace, measure, set.zones, 0, activity.n)
  return { digest: counted?.kind === 'counted' ? counted.seconds : null, trace: exact.seconds }
}

describe('time in zones, the digest and the trace', () => {
  it('puts an hour at one wattage in the zone of that wattage, whichever side of an edge it is on', () => {
    // Threshold 267 W: Z2 ends at 200 W (0.75 of 267 is 200.25, moved to the 5 W bin edge).
    for (const watts of [146, 147, 200, 201, 202, 240, 241]) {
      const activity = syntheticActivity({
        n: 3600,
        sport: 'ride',
        power: new Float64Array(3600).fill(watts),
      })
      const { digest, trace } = bothWays(activity, 'power', 267)
      expect(digest).toEqual(trace)
      expect(trace.reduce((a, b) => a + b, 0)).toBe(3600)
    }
  })

  it('puts an hour at one belt speed in the zone of that speed', () => {
    // Threshold 3.5 m/s: the edge between Tempo and Sub-threshold is about 3.30 m/s.
    for (const speed of [3.2, 3.29, 3.3, 3.31, 3.333, 3.4, 3.5]) {
      const activity = syntheticActivity({
        n: 3600,
        indoor: true,
        speed: new Float64Array(3600).fill(speed),
      })
      const { digest, trace } = bothWays(activity, 'pace', 3.5)
      expect(digest).toEqual(trace)
    }
  })

  it('agrees second for second over watts that cross every edge', () => {
    const n = 3000
    const power = Float64Array.from({ length: n }, (_, i) => (i * 7) % 420)
    for (const reference of [137, 201, 267, 310.4]) {
      const ride = syntheticActivity({ n, sport: 'ride', power })
      const { digest, trace } = bothWays(ride, 'power', reference)
      expect(digest).toEqual(trace)
    }
  })

  it('agrees second for second over speeds that cross every edge', () => {
    const n = 3000
    const speed = Float64Array.from({ length: n }, (_, i) => 1.5 + ((i * 37) % 350) / 100)
    for (const reference of [2.9, 3.5, 4.1]) {
      const run = syntheticActivity({ n, speed })
      const { digest, trace } = bothWays(run, 'pace', reference)
      expect(digest).toEqual(trace)
    }
  })
})

/** Both ways for one activity over many thresholds; the digest and the trace are made once. */
function sweep(activity: Activity, measure: ZoneMeasure, references: number[]) {
  const digest = digestActivity(activity)
  const trace = activityTraceOf(activity, assessQuality(activity, []))
  let mismatches = 0
  let cases = 0
  for (const reference of references) {
    const zones = zonesFor(measure, reference)
    const set: ZoneSet = {
      sport: activity.sport,
      measure,
      source: 'entered',
      reference,
      estimatedFrom: [],
      citation: '',
      zones,
    }
    const counted = activityTimeInZones(digest, [set])[measure]
    const exact = traceTimeInZones(trace, measure, zones, 0, activity.n).seconds
    cases++
    if (counted?.kind !== 'counted' || counted.seconds.join() !== exact.join()) mismatches++
  }
  return { cases, mismatches }
}

const range = (from: number, to: number, step: number) =>
  Array.from({ length: Math.floor((to - from) / step + 1e-9) + 1 }, (_, i) => from + i * step)

describe('time in zones over many thresholds', () => {
  const n = 4000

  it('agrees for speeds on and off the bin edges, at every threshold from slow to fast', () => {
    // Readings on 0.001 m/s steps, and on 0.01 steps, which lie on a bin edge every fifth reading.
    const fine = Float64Array.from(
      { length: n },
      (_, i) => 1 + (i % 400) * 0.01 + ((i * 13) % 7) * 0.001,
    )
    const coarse = Float64Array.from({ length: n }, (_, i) => 1 + (i % 400) * 0.01)
    const refs = range(1.5, 7.5, 0.07)
    const a = sweep(syntheticActivity({ n, speed: fine }), 'pace', refs)
    const b = sweep(syntheticActivity({ n, indoor: true, speed: coarse }), 'pace', refs)
    expect(a.cases + b.cases).toBe(2 * refs.length)
    expect(a.mismatches + b.mismatches).toBe(0)
  })

  it('agrees for watts, whole and fractional, at every threshold from 50 to 700 W', () => {
    const refs = range(50, 700, 7)
    const whole = Float64Array.from({ length: n }, (_, i) => i % 700)
    const part = Float64Array.from({ length: n }, (_, i) => (i % 700) + (i % 3) * 0.4)
    const a = sweep(syntheticActivity({ n, sport: 'ride', power: whole }), 'power', refs)
    const b = sweep(syntheticActivity({ n, sport: 'ride', power: part }), 'power', refs)
    expect(a.mismatches + b.mismatches).toBe(0)
  })

  it('agrees for seeded random readings and thresholds', () => {
    const random = mulberry32(2024)
    const speed = Float64Array.from({ length: n }, () => 0.8 + random() * 6)
    const power = Float64Array.from({ length: n }, () => Math.floor(random() * 800))
    const paceRefs = Array.from({ length: 60 }, () => 1.2 + random() * 5)
    const powerRefs = Array.from({ length: 60 }, () => 80 + Math.round(random() * 4000) / 10)
    expect(sweep(syntheticActivity({ n, speed }), 'pace', paceRefs).mismatches).toBe(0)
    expect(
      sweep(syntheticActivity({ n, sport: 'ride', power }), 'power', powerRefs).mismatches,
    ).toBe(0)
  })
})
