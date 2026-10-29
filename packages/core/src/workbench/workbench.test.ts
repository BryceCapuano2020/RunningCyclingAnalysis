import { describe, expect, it } from 'vitest'
import type { ActivityTrace } from './types'
import { activityTraceOf, parseActivityTrace } from './trace'
import { detectIntervals } from './intervals'
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

describe('conservative interval suggestions', () => {
  /** A run whose speed holds each level for its seconds, in order, with a little deterministic noise. */
  function plan(...stretches: [seconds: number, speed: number][]): ActivityTrace {
    const speeds = stretches.flatMap(([seconds, speed]) => new Array<number>(seconds).fill(speed))
    const item = trace(speeds.length)
    item.streams.speed = Float32Array.from(speeds, (value, i) =>
      Number.isNaN(value) ? value : value + (((i * 7) % 5) - 2) * 0.02,
    )
    return item
  }
  const near = (found: number, wanted: number) => Math.abs(found - wanted) <= 10

  it('marks repeated efforts as editable inferred intervals', () => {
    const item = plan([200, 3], [90, 5], [120, 3], [90, 5], [200, 3])
    const suggestions = detectIntervals(item)
    expect(suggestions).toHaveLength(2)
    expect(suggestions.every((lap) => lap.label === 'Inferred interval')).toBe(true)
    expect(suggestions.every((lap) => lap.endS - lap.startS >= 60)).toBe(true)
  })

  it('places a step at its window centre, not a window early', () => {
    const suggestions = detectIntervals(plan([200, 3], [90, 5], [120, 3], [90, 5], [200, 3]))
    expect(suggestions).toHaveLength(2)
    expect(near(suggestions[0]!.startS, 200) && near(suggestions[0]!.endS, 290)).toBe(true)
    expect(near(suggestions[1]!.startS, 410) && near(suggestions[1]!.endS, 500)).toBe(true)
  })

  it('does not bridge a paused or unrecorded stretch inside an effort', () => {
    const item = plan([200, 3], [290, 5], [120, 3], [90, 5], [200, 3])
    for (let i = 300; i < 306; i++) item.paused[i] = 1
    for (let i = 380; i < 383; i++) item.unrecorded[i] = 1
    const suggestions = detectIntervals(item)
    expect(suggestions.length).toBe(4)
    for (const lap of suggestions) {
      for (let i = lap.startS; i < lap.endS; i++) {
        expect(item.paused[i] === 1 || item.unrecorded[i] === 1).toBe(false)
      }
    }
  })

  it('suggests nothing from a trace with neither power nor speed', () => {
    const item = trace(240)
    delete item.streams.speed
    expect(detectIntervals(item)).toEqual([])
  })

  describe('leaves one sustained change alone', () => {
    it('a steady run that starts with a walk', () => {
      expect(detectIntervals(plan([30, 1.5], [3000, 3]))).toEqual([])
    })

    it('a progressive run', () => {
      const steps = Array.from({ length: 10 }, (_, k): [number, number] => [300, 2.6 + k * 0.1])
      expect(detectIntervals(plan(...steps))).toEqual([])
    })

    it('a negative split', () => {
      expect(detectIntervals(plan([1500, 3], [1500, 3.6]))).toEqual([])
    })

    it('a tempo finish after an easy start', () => {
      expect(detectIntervals(plan([1800, 2.8], [900, 3.8]))).toEqual([])
      expect(detectIntervals(plan([1200, 2.8], [1200, 2.8], [600, 3.8]))).toEqual([])
    })

    it('a tempo block that wobbles across the threshold for a few seconds', () => {
      const item = plan([1800, 2.8], [900, 3.8], [900, 2.8])
      const speed = item.streams.speed!
      for (let i = 2000; i < 2012; i++) speed[i] = 2.8
      expect(detectIntervals(item)).toEqual([])
    })

    it('a steady run that starts stationary', () => {
      expect(detectIntervals(plan([60, Number.NaN], [3000, 3]))).toEqual([])
    })
  })

  describe('finds the efforts of a session', () => {
    it('that starts with a walk', () => {
      const efforts: [number, number][] = [[30, 1.5]]
      for (let k = 0; k < 5; k++) efforts.push([120, 4.5], [180, 3])
      const found = detectIntervals(plan(...efforts))
      expect(found).toHaveLength(5)
      found.forEach((lap, k) => {
        expect(near(lap.startS, 30 + k * 300)).toBe(true)
        expect(near(lap.endS, 150 + k * 300)).toBe(true)
      })
    })

    it('whose first minute is stationary', () => {
      const found = detectIntervals(
        plan([60, Number.NaN], [340, 3], [120, 5], [200, 3], [120, 5], [300, 3]),
      )
      expect(found).toHaveLength(2)
      expect(near(found[0]!.startS, 400) && near(found[0]!.endS, 520)).toBe(true)
    })

    it('of track repeats, 6 x 800 m with a jog between', () => {
      const session: [number, number][] = [[900, 2.6]]
      for (let k = 0; k < 6; k++) session.push([190, 4.2], [150, 2.5])
      session.push([600, 2.6])
      const found = detectIntervals(plan(...session))
      expect(found).toHaveLength(6)
    })

    it('of hill repeats, climbing slowly and jogging back down', () => {
      const session: [number, number][] = [[600, 3]]
      for (let k = 0; k < 5; k++) session.push([150, 2], [240, 3])
      session.push([300, 3])
      const found = detectIntervals(plan(...session))
      expect(found).toHaveLength(5)
      expect(found.every((lap) => lap.endS - lap.startS >= 100)).toBe(true)
    })

    it('of a fartlek with surges of different lengths', () => {
      const found = detectIntervals(
        plan([600, 3], [60, 4.5], [240, 3], [150, 4.5], [300, 3], [90, 4.5], [400, 3]),
      )
      expect(found).toHaveLength(3)
    })

    it('when the efforts and the rests are half the session each, taking the side that is not the warm-up', () => {
      const item = trace(1200)
      item.sport = 'ride'
      item.streams.power = Float32Array.from({ length: 1200 }, (_, i) =>
        i >= 120 && (i - 120) % 270 < 150 ? 300 : 100,
      )
      const found = detectIntervals(item)
      expect(found).toHaveLength(4)
      expect(found.every((lap) => lap.startS > 120)).toBe(true)
    })

    it('with the same power repeats for a ride', () => {
      const item = trace(1500)
      item.sport = 'ride'
      item.streams.power = Float32Array.from({ length: 1500 }, (_, i) =>
        i % 400 >= 100 && i % 400 < 220 ? 320 : 180,
      )
      expect(detectIntervals(item)).toHaveLength(4)
    })
  })
})
