import { describe, expect, it } from 'vitest'
import {
  channelsFor,
  lapChoicesOf,
  overviewOf,
  skippedStretches,
  timelineMarks,
} from './workbenchChannels'
import { repsTrace, runTrace, steadyTrace } from './workbenchFixtures'

describe('timelineMarks', () => {
  it('marks each pause and each gap, and lets a gap outrank a pause it overlaps', () => {
    const trace = steadyTrace(20)
    trace.paused.fill(1, 2, 8)
    trace.unrecorded.fill(1, 5, 12)
    expect(timelineMarks(trace)).toEqual([
      { kind: 'paused', startS: 2, endS: 5 },
      { kind: 'unrecorded', startS: 5, endS: 12 },
    ])
  })

  it('marks nothing on an activity with neither', () => {
    expect(timelineMarks(steadyTrace(30))).toEqual([])
  })

  it('reads the fixture’s pause and gap', () => {
    expect(timelineMarks(runTrace())).toEqual([
      { kind: 'paused', startS: 2, endS: 3 },
      { kind: 'unrecorded', startS: 9, endS: 10 },
    ])
  })
})

describe('skippedStretches', () => {
  it('reads the left-out seconds of a measure as stretches, and nothing for a measure without any', () => {
    const trace = steadyTrace(30)
    const mask = new Uint8Array(30)
    mask.fill(1, 3, 6)
    mask[10] = 1
    trace.unusable = { heartRate: mask }
    expect(skippedStretches(trace, 'heartRate')).toEqual([
      [3, 6],
      [10, 11],
    ])
    expect(skippedStretches(trace, 'speed')).toEqual([])
    expect(skippedStretches(trace, 'altitude')).toEqual([])
  })
})

describe('lapChoicesOf', () => {
  it('offers recorded laps, none for a single lap, and suggested intervals when there are no laps', () => {
    expect(lapChoicesOf(runTrace())).toMatchObject({ recorded: true })
    expect(lapChoicesOf(runTrace()).laps).toHaveLength(2)
    const single = runTrace()
    single.laps = [{ startS: 0, endS: 10 }]
    expect(lapChoicesOf(single).laps).toEqual([])
    const reps = repsTrace('ride', [
      { seconds: 120, power: 100 },
      { seconds: 120, power: 300 },
      { seconds: 120, power: 100 },
      { seconds: 120, power: 300 },
    ])
    const suggested = lapChoicesOf(reps)
    expect(suggested.recorded).toBe(false)
    expect(suggested.laps.length).toBeGreaterThan(1)
  })
})

describe('channelsFor', () => {
  it('gives each measure its colour, its axis with room around the readings, and its words at a second', () => {
    const trace = steadyTrace(300)
    trace.streams.heartRate = Float32Array.from({ length: 300 }, (_, i) => 120 + (i % 20))
    const channels = channelsFor(trace, ['speed', 'heartRate'], 'metric', 0, 300, 300, 3)
    const heart = channels.find((channel) => channel.key === 'heartRate')!
    expect(heart.colour).toBe('heartrate')
    expect(heart.shape).toBe('line')
    // The readings run 120 to 139, and the axis leaves a margin of 8% beyond each.
    expect(heart.low).toBeLessThan(120)
    expect(heart.high).toBeGreaterThan(139)
    expect(heart.at(10)).toMatchObject({ unit: 'bpm' })
    expect(heart.average).toEqual({ value: '130', unit: 'bpm' })
    expect(channels[0]!.colour).toBe('pace')
  })

  it('draws elevation as an area on its own colour, and never lets a power axis go below zero', () => {
    const trace = steadyTrace(120)
    trace.streams.altitude = Float32Array.from({ length: 120 }, (_, i) => 100 + i / 10)
    trace.streams.power = Float32Array.from({ length: 120 }, (_, i) => 2 + (i % 3) * 100)
    const [power, altitude] = channelsFor(trace, ['power', 'altitude'], 'metric', 0, 120, 120, 3)
    expect(power!.low).toBe(0)
    expect(altitude).toMatchObject({ colour: 'elevation', shape: 'area' })
    expect(altitude!.low).toBeLessThan(100)
  })

  it('leaves out a measure with no reading in the window, and gives a flat one a margin', () => {
    const trace = steadyTrace(120)
    trace.streams.cadence = new Float32Array(120).fill(Number.NaN)
    const channels = channelsFor(trace, ['speed', 'cadence'], 'metric', 0, 120, 120, 3)
    expect(channels.map((channel) => channel.key)).toEqual(['speed'])
    expect(channels[0]!.high).toBeGreaterThan(channels[0]!.low)
  })

  it('reads imperial elevation in feet on its axis, and the reading in the same unit', () => {
    const trace = steadyTrace(120)
    trace.streams.altitude = Float32Array.from({ length: 120 }, (_, i) => 100 + i)
    const [altitude] = channelsFor(trace, ['altitude'], 'imperial', 0, 120, 120, 3)
    expect(altitude!.unit).toBe('ft')
    expect(altitude!.at(60)).toMatchObject({ unit: 'ft', value: '525' })
  })
})

describe('overviewOf', () => {
  it('prefers the terrain, then the first measure with readings', () => {
    expect(overviewOf(steadyTrace(300), 300)?.colour).toBe('pace')
    const hilly = steadyTrace(300)
    hilly.streams.altitude = Float32Array.from({ length: 300 }, (_, i) => i)
    expect(overviewOf(hilly, 300)?.colour).toBe('elevation')
  })

  it('has none for a trace with no readings to draw', () => {
    const trace = steadyTrace(30)
    trace.streams = {}
    expect(overviewOf(trace, 30)).toBeNull()
  })
})
