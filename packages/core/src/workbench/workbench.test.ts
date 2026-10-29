import { describe, expect, it } from 'vitest'
import type { ActivityTrace } from './types'
import { activityTraceOf, parseActivityTrace } from './trace'
import { readingBand } from './band'
import { isTraceObservation, summarizeSelection } from './selection'

function trace(n: number): ActivityTrace {
  const distance = Float64Array.from({ length: n }, (_, i) => i * 10)
  return {
    version: 1,
    activityId: 'trace',
    sport: 'run',
    durationS: n,
    distance,
    paused: new Uint8Array(n),
    unrecorded: new Uint8Array(n),
    streams: {
      speed: Float32Array.from({ length: n }, () => 3),
      heartRate: Float32Array.from({ length: n }, (_, i) => 100 + i),
      temperature: Float32Array.from({ length: n }, () => 18),
    },
    laps: [],
  }
}

describe('activity evidence trace', () => {
  it('copies the measured streams and omits absent power, cadence, and temperature', () => {
    const activity = {
      id: 'a',
      name: 'A',
      sport: 'ride' as const,
      startMs: 0,
      n: 2,
      speed: new Float64Array([4, 5]),
      distance: new Float64Array([0, 5]),
      altitude: new Float64Array([20, 21]),
      heartRate: new Float64Array([120, 121]),
      power: new Float64Array([NaN, NaN]),
      paused: new Uint8Array(2),
      hasPower: false,
      hasHeartRate: true,
      hasAltitude: true,
      indoor: false,
      laps: [
        { startS: 0, endS: 4, label: 'Lap 1' },
        { startS: 1, endS: 2, label: 'Overlap' },
      ],
    }
    const result = activityTraceOf(activity)
    expect(result.streams.power).toBeUndefined()
    expect(result.streams.cadence).toBeUndefined()
    expect(result.streams.temperature).toBeUndefined()
    expect(result.streams.speed).not.toBe(activity.speed)
    expect(result.unrecorded).toEqual(new Uint8Array(2))
    expect(result.laps).toEqual([{ startS: 0, endS: 2, label: 'Lap 1' }])
    expect(result.cadenceUnit).toBeUndefined()
  })

  it('leaves speed and distance out when the source recorded neither', () => {
    const activity = {
      id: 'a',
      name: 'A',
      sport: 'ride' as const,
      startMs: 0,
      n: 3,
      speed: new Float64Array(3),
      distance: new Float64Array(3),
      altitude: new Float64Array(3).fill(NaN),
      heartRate: new Float64Array([120, 121, 122]),
      power: new Float64Array(3).fill(NaN),
      paused: new Uint8Array(3),
      hasPower: false,
      hasHeartRate: true,
      hasAltitude: false,
      hasMotion: false,
      indoor: true,
    }
    const result = activityTraceOf(activity)
    expect(result.streams.speed).toBeUndefined()
    expect(result.streams.heartRate).toBeDefined()
    expect(result.distance.every(Number.isNaN)).toBe(true)
    expect(summarizeSelection(result, 0, 3).distanceM).toBeNull()
    expect(parseActivityTrace(result)).not.toBeNull()
  })

  it('accepts only sports that have a trace row', () => {
    expect(parseActivityTrace({ ...trace(3), sport: 'ride' })).not.toBeNull()
    expect(parseActivityTrace({ ...trace(3), sport: 'swim' })).toBeNull()
    expect(parseActivityTrace({ ...trace(3), sport: 'toString' })).toBeNull()
  })

  it('retains explicit cadence provenance while validating and stripping unknown fields', () => {
    const valid = {
      ...trace(3),
      cadenceUnit: 'unknown' as const,
      streams: { ...trace(3).streams, cadence: new Float32Array([80, 81, 82]) },
      extra: 'ignored',
    }
    const parsed = parseActivityTrace(valid)
    expect(parsed?.cadenceUnit).toBe('unknown')
    expect(parsed).not.toHaveProperty('extra')
    expect(parseActivityTrace({ ...valid, cadenceUnit: 'rpm' })).toBeNull()
    expect(parseActivityTrace({ ...valid, streams: { speed: valid.streams.speed } })).toBeNull()

    const legacy = parseActivityTrace(trace(3))
    expect(legacy).not.toBeNull()
    expect(legacy).not.toHaveProperty('cadenceUnit')
  })

  it('rejects malformed durations, lengths, infinite values, distances, masks, and lap bounds', () => {
    const valid = trace(3)
    expect(parseActivityTrace(valid)).not.toBeNull()
    expect(parseActivityTrace({ ...valid, durationS: 4 })).toBeNull()
    expect(
      parseActivityTrace({ ...valid, streams: { speed: new Float32Array([1, Infinity, 2]) } }),
    ).toBeNull()
    expect(parseActivityTrace({ ...valid, distance: new Float64Array([0, 5, 4]) })).toBeNull()
    expect(parseActivityTrace({ ...valid, paused: new Uint8Array([0, 2, 0]) })).toBeNull()
    expect(parseActivityTrace({ ...valid, laps: [{ startS: 1, endS: 4 }] })).toBeNull()
    expect(parseActivityTrace({ ...valid, laps: [{ startS: 1.5, endS: 2 }] })).toBeNull()
  })
})

describe('selection evidence', () => {
  it('keeps elapsed, paused, recording-gap, and metric time distinct', () => {
    const item = trace(5)
    item.paused[1] = 1
    item.unrecorded[3] = 1
    item.streams.heartRate![1] = 180
    item.streams.heartRate![3] = 140
    const summary = summarizeSelection(item, 0, 5)
    expect(summary.elapsedS).toBe(5)
    expect(summary.recordedS).toBe(4)
    expect(summary.movingS).toBe(3)
    expect(summary.metrics.heartRate).toEqual({ mean: 102, min: 100, max: 104, seconds: 3 })
    expect(summary.distanceM).toBeNull()
    expect(summarizeSelection(item, 0, 2).distanceM).toBe(20)
  })

  it('uses both distance boundaries for an interior selection and ends at the last sample', () => {
    const item = trace(30)
    expect(summarizeSelection(item, 10, 20).distanceM).toBe(100)
    // The last sample has no closing boundary, so a tail selection measures up to that sample.
    expect(summarizeSelection(item, 20, 30).distanceM).toBe(90)
    expect(summarizeSelection(item, 0, 29).distanceM).toBe(290)
  })

  it('reports the activity total for a whole-activity selection', () => {
    const item = trace(30)
    expect(summarizeSelection(item, 0, 30).distanceM).toBe(item.distance[29]! - item.distance[0]!)
  })

  it('has no distance for a selection that starts at the last sample', () => {
    expect(summarizeSelection(trace(30), 29, 30).distanceM).toBeNull()
    expect(summarizeSelection(trace(1), 0, 1).distanceM).toBeNull()
  })

  it('rejects a selection whose end boundary is inside an unrecorded gap', () => {
    const item = trace(3)
    item.distance.set([0, 10, 10])
    item.unrecorded[1] = 1
    expect(summarizeSelection(item, 0, 1).distanceM).toBeNull()
  })

  it('returns no fabricated distance at unknown or unrecorded boundaries', () => {
    const item = trace(4)
    item.distance[2] = NaN
    expect(summarizeSelection(item, 1, 4).distanceM).toBeNull()
    item.distance[2] = 20
    item.unrecorded[2] = 1
    expect(summarizeSelection(item, 1, 4).distanceM).toBeNull()
    expect(() => summarizeSelection(item, -1, 2)).toThrow(RangeError)
  })

  it('shares observation validity with plots and summaries', () => {
    const item = trace(4)
    item.streams.heartRate![1] = 251
    item.paused[2] = 1
    item.unrecorded[3] = 1
    expect([0, 1, 2, 3, 4].map((index) => isTraceObservation(item, 'heartRate', index))).toEqual([
      true,
      false,
      false,
      false,
      false,
    ])
    expect(summarizeSelection(item, 0, 4).metrics.heartRate?.seconds).toBe(1)
  })

  it('excludes pause-filled power zeros from moving-time summaries', () => {
    const item = trace(3)
    item.streams.power = new Float32Array([200, 0, 200])
    item.paused[1] = 1
    const summary = summarizeSelection(item, 0, 3)
    expect(summary.elapsedS).toBe(3)
    expect(summary.recordedS).toBe(3)
    expect(summary.movingS).toBe(2)
    expect(summary.metrics.power).toEqual({ mean: 200, min: 200, max: 200, seconds: 2 })
  })
})

describe('seconds the quality assessment left out', () => {
  function spiked() {
    const item = trace(600)
    item.sport = 'ride'
    item.streams.power = Float32Array.from({ length: 600 }, (_, i) => (i === 300 ? 2400 : 200))
    item.unusable = { power: Uint8Array.from({ length: 600 }, (_, i) => (i === 300 ? 1 : 0)) }
    return item
  }

  it('leaves a flagged spike out of the selection summary and the reading band', () => {
    const item = spiked()
    expect(summarizeSelection(item, 0, 600).metrics.power).toEqual({
      mean: 200,
      min: 200,
      max: 200,
      seconds: 599,
    })
    expect(isTraceObservation(item, 'power', 300)).toBe(false)
    expect(isTraceObservation(item, 'power', 301)).toBe(true)
    expect(readingBand(item, 'power', 0, 600)).toEqual({ low: 200, high: 200, below: 0, above: 0 })
  })

  it('reads every reading of a trace built without the assessment', () => {
    const item = spiked()
    delete item.unusable
    expect(summarizeSelection(item, 0, 600).metrics.power?.max).toBe(2400)
  })
})
