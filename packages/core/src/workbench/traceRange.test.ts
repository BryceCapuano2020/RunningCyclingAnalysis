import { describe, expect, it } from 'vitest'
import { parseTcx } from '../tcx/parse'
import type { Activity } from '../types'
import { activityTraceOf, parseActivityTrace } from './trace'

const START_MS = Date.UTC(2024, 4, 1, 7, 30, 0)

function activityWithAltitude(altitude: number[]): Activity {
  const n = altitude.length
  return {
    id: 'range',
    name: 'range',
    sport: 'run',
    startMs: START_MS,
    n,
    speed: new Float64Array(n).fill(3),
    distance: Float64Array.from({ length: n }, (_, i) => i * 3),
    altitude: Float64Array.from(altitude),
    heartRate: new Float64Array(n).fill(NaN),
    power: new Float64Array(n).fill(NaN),
    paused: new Uint8Array(n),
    hasPower: false,
    hasHeartRate: false,
    hasAltitude: true,
    indoor: false,
  }
}

describe('a trace of values beyond the Float32 range', () => {
  it('leaves them missing, so the trace still validates and stores', () => {
    const trace = activityTraceOf(activityWithAltitude([10, 1e39, -1e39, Infinity, 12]))
    expect(Array.from(trace.streams.altitude!)).toEqual([10, NaN, NaN, NaN, 12])
    expect(parseActivityTrace(trace)).not.toBeNull()
  })

  it('survives a TCX with one absurd <ele> value, from import to trace', () => {
    const points = Array.from({ length: 120 }, (_, s) => {
      const time = new Date(START_MS + s * 1000).toISOString()
      const lat = 51.5 + s * 0.00003
      const ele = s === 60 ? '1e39' : String(20 + s * 0.1)
      return (
        `<Trackpoint><Time>${time}</Time><Position><LatitudeDegrees>${lat}</LatitudeDegrees>` +
        `<LongitudeDegrees>-0.12</LongitudeDegrees></Position><AltitudeMeters>${ele}</AltitudeMeters>` +
        `<DistanceMeters>${s * 3}</DistanceMeters></Trackpoint>`
      )
    })
    const xml =
      '<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">' +
      `<Activities><Activity Sport="Running"><Id>${new Date(START_MS).toISOString()}</Id>` +
      `<Lap StartTime="${new Date(START_MS).toISOString()}"><Track>${points.join('')}</Track></Lap>` +
      '</Activity></Activities></TrainingCenterDatabase>'
    const result = parseTcx(new TextEncoder().encode(xml), 'absurd.tcx')
    if (!result.ok) throw new Error(result.reason)
    const trace = activityTraceOf(result.activities[0]!)
    expect(parseActivityTrace(trace)).not.toBeNull()
    expect(Math.max(...trace.streams.altitude!)).toBeLessThan(100)
  })
})
