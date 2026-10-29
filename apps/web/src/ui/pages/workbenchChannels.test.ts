import { describe, expect, it } from 'vitest'
import {
  channelsFor,
  lapChoicesOf,
  overviewOf,
  plotDomain,
  skippedStretches,
  timelineMarks,
} from './workbenchChannels'
import { selectionOf } from './workbenchData'
import { repsTrace, runTrace, steadyTrace } from './workbenchFixtures'
import { readingOf } from './workbenchScale'

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
    trace.streams.power = Float32Array.from({ length: 120 }, (_, i) => 2 + i / 2)
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

describe('the reading at a second', () => {
  it('is nothing in a paused or unrecorded stretch, though the average round it has a value', () => {
    const trace = steadyTrace(300)
    trace.paused.fill(1, 100, 130)
    trace.unrecorded.fill(1, 200, 205)
    trace.streams.heartRate![50] = Number.NaN
    const [pace, heart] = channelsFor(trace, ['speed', 'heartRate'], 'metric', 0, 300, 300, 3)
    expect(pace!.at(99)).not.toBeNull()
    expect(pace!.at(110)).toBeNull()
    expect(pace!.at(202)).toBeNull()
    expect(pace!.at(130)).not.toBeNull()
    // A single second the watch dropped is a hiccup: the reading carries across it.
    expect(heart!.at(50)).not.toBeNull()
  })

  it('has the average of the selection the summary has for the same seconds', () => {
    const trace = runTrace()
    for (const [startS, endS] of [
      [0, 10],
      [2, 6],
      [6, 10],
    ] as const) {
      const stats = selectionOf(trace, startS, endS).metrics
      const channels = channelsFor(
        trace,
        ['speed', 'heartRate', 'cadence'],
        'metric',
        startS,
        endS,
        100,
        3,
      )
      for (const channel of channels) {
        const metric = channel.key as 'speed' | 'heartRate' | 'cadence'
        const mean = stats[metric]!.mean!
        expect(channel.average, metric).toEqual(
          readingOf(metric, mean, trace.sport, 'metric', trace.cadenceUnit),
        )
      }
    }
  })
})

describe('a run’s pace axis', () => {
  it('never reaches zero speed, whatever the selection, and so always ends', () => {
    // A brush of one second on a walking stretch: a flat 0.7 m/s, which padding would take past zero.
    const trace = steadyTrace(60, 0.7)
    for (const [startS, endS] of [
      [0, 1],
      [10, 11],
      [0, 60],
    ] as const) {
      const domain = plotDomain(trace, 'speed', startS, endS)
      expect(domain?.low).toBeGreaterThanOrEqual(0.5)
      const [pace] = channelsFor(trace, ['speed'], 'metric', startS, endS, 100, 3)
      expect(pace!.ticks.every((tick) => Number.isFinite(tick.value))).toBe(true)
    }
  })

  it('keeps a ride’s speed axis to zero, where a stop is a real reading', () => {
    const trace = steadyTrace(60, 0.1)
    trace.sport = 'ride'
    expect(plotDomain(trace, 'speed', 0, 60)?.low).toBe(0)
  })
})

describe('plotDomain below zero', () => {
  it('never widens a measure that cannot be negative below zero, and keeps the width', () => {
    // A power meter that mostly reads 0 with a spike now and then: the trend sits near 3 W, the band at the
    // spikes' 100 W, and a fifth of that span, 20 W, centred on 3 would reach -7.
    const trace = steadyTrace(3600)
    trace.streams.power = Float32Array.from({ length: 3600 }, (_, i) => (i % 33 === 0 ? 100 : 0))
    const domain = plotDomain(trace, 'power', 0, 3600)!
    expect(domain.low).toBeGreaterThanOrEqual(0)
    expect(domain.high - domain.low).toBeGreaterThan(20)
  })

  it('still lets elevation, which can be below sea level, go below zero', () => {
    const trace = steadyTrace(600)
    trace.streams.altitude = Float32Array.from({ length: 600 }, (_, i) => -20 + i / 100)
    expect(plotDomain(trace, 'altitude', 0, 600)!.low).toBeLessThan(-20)
  })
})

describe('plotDomain', () => {
  it('fits the axis to the smoothed trend, so a few spikes clip at the edge and do not squeeze the rest', () => {
    const trace = steadyTrace(3600)
    // A steady 200 W with four one-second spikes to 900 W, a ninth of a percent of the ride.
    trace.streams.power = Float32Array.from({ length: 3600 }, (_, i) =>
      i % 900 === 0 ? 900 : 200 + (i % 7),
    )
    const domain = plotDomain(trace, 'power', 0, 3600)!
    expect(domain.high).toBeLessThan(260)
    expect(domain.low).toBeGreaterThan(150)
    const [power] = channelsFor(trace, ['power'], 'metric', 0, 3600, 600, 3)
    // The raw spike is still in the band, past the axis, which the row marks.
    expect(Math.max(...power!.columns.hi.filter(Number.isFinite))).toBe(900)
    expect(power!.high).toBe(domain.high)
  })

  it('takes every reading of an area, which has no spikes, and none of a measure with no readings', () => {
    const trace = steadyTrace(600)
    trace.streams.altitude = Float32Array.from({ length: 600 }, (_, i) => i)
    const area = plotDomain(trace, 'altitude', 0, 600)!
    expect(area.low).toBeLessThan(0)
    expect(area.high).toBeGreaterThan(599)
    trace.streams.cadence = new Float32Array(600).fill(Number.NaN)
    expect(plotDomain(trace, 'cadence', 0, 600)).toBeNull()
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
