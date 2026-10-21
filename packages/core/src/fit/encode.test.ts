import { Decoder, Stream } from '@garmin/fitsdk'
import { describe, expect, it } from 'vitest'
import type { Activity, Sport } from '../types'
import { encodeFit } from './encode'

const START_MS = Date.UTC(2024, 0, 15, 6, 0, 0)

function makeActivity(sport: Sport, n: number, withPower: boolean): Activity {
  const speed = new Float64Array(n)
  const distance = new Float64Array(n)
  const altitude = new Float64Array(n)
  const heartRate = new Float64Array(n)
  const power = new Float64Array(n)
  let total = 0
  for (let i = 0; i < n; i++) {
    const v = 3 + (i % 5) * 0.5
    speed[i] = v
    total += v
    distance[i] = total
    altitude[i] = 200 + i * 0.4
    heartRate[i] = 130 + (i % 10)
    power[i] = withPower ? 250 + (i % 8) : NaN
  }
  return {
    id: 'fixture',
    name: 'fixture',
    sport,
    startMs: START_MS,
    n,
    speed,
    distance,
    altitude,
    heartRate,
    power,
    paused: new Uint8Array(n),
    hasPower: withPower,
    hasHeartRate: true,
    hasAltitude: true,
    indoor: false,
  }
}

function decode(bytes: Uint8Array) {
  return new Decoder(Stream.fromByteArray(bytes)).read()
}

describe('encodeFit', () => {
  it('writes a valid FIT file with one record per second', () => {
    const bytes = encodeFit(makeActivity('ride', 5, true))
    const decoder = new Decoder(Stream.fromByteArray(bytes))
    expect(decoder.isFIT()).toBe(true)
    expect(decoder.checkIntegrity()).toBe(true)

    const { messages, errors } = decode(bytes)
    expect(errors).toEqual([])
    expect(messages.fileIdMesgs?.[0]?.type).toBe('activity')
    expect(messages.recordMesgs?.length).toBe(5)
    expect(messages.lapMesgs?.length).toBe(1)
    expect(messages.sessionMesgs?.length).toBe(1)
    expect(messages.activityMesgs?.length).toBe(1)
  })

  it('maps the ride and run sports to cycling and running', () => {
    expect(decode(encodeFit(makeActivity('ride', 3, true))).messages.sessionMesgs?.[0]?.sport).toBe(
      'cycling',
    )
    expect(decode(encodeFit(makeActivity('run', 3, false))).messages.sessionMesgs?.[0]?.sport).toBe(
      'running',
    )
  })

  it('writes the record fields and rounds heart rate and power to whole numbers', () => {
    const a = makeActivity('ride', 3, true)
    a.heartRate[1] = 143.6
    a.power[1] = 251.4
    const records = decode(encodeFit(a)).messages.recordMesgs ?? []
    expect(records[0]?.timestamp).toEqual(new Date(START_MS))
    expect(records[1]?.timestamp).toEqual(new Date(START_MS + 1000))
    expect(records[1]?.heartRate).toBe(144)
    expect(records[1]?.power).toBe(251)
    expect(records[2]?.enhancedSpeed).toBeCloseTo(a.speed[2] ?? NaN, 3)
    expect(records[2]?.distance).toBeCloseTo(a.distance[2] ?? NaN, 2)
    expect(records[2]?.enhancedAltitude).toBeCloseTo(a.altitude[2] ?? NaN, 1)
  })

  it('omits fields whose value is NaN', () => {
    const records = decode(encodeFit(makeActivity('run', 3, false))).messages.recordMesgs ?? []
    expect(records.length).toBe(3)
    for (const record of records) {
      expect('power' in record).toBe(false)
      expect('heartRate' in record).toBe(true)
    }
  })

  it('writes the lap and session totals from the activity', () => {
    const a = makeActivity('ride', 10, true)
    const { messages } = decode(encodeFit(a))
    const session = messages.sessionMesgs?.[0]
    const lap = messages.lapMesgs?.[0]
    expect(session?.totalElapsedTime).toBe(10)
    expect(session?.totalTimerTime).toBe(10)
    expect(session?.totalDistance).toBeCloseTo(a.distance[9] ?? NaN, 2)
    expect(session?.numLaps).toBe(1)
    expect(lap?.totalElapsedTime).toBe(10)
    expect(lap?.totalDistance).toBeCloseTo(a.distance[9] ?? NaN, 2)
    expect(messages.activityMesgs?.[0]?.numSessions).toBe(1)
  })

  it('reports zero session distance when the last distance sample is unknown', () => {
    const a = makeActivity('ride', 4, true)
    a.distance[3] = NaN
    const session = decode(encodeFit(a)).messages.sessionMesgs?.[0]
    expect(session?.totalDistance).toBe(0)
  })

  it('writes the sub-sport and placeholder positions only when asked', () => {
    const a = makeActivity('ride', 3, true)
    const plain = decode(encodeFit(a)).messages
    expect(plain.sessionMesgs?.[0]?.subSport).toBeUndefined()
    expect(plain.recordMesgs?.[0]?.positionLat).toBeUndefined()

    const tagged = decode(encodeFit(a, { subSport: 'eBikeMountain', gps: true })).messages
    expect(tagged.sessionMesgs?.[0]?.subSport).toBe('eBikeMountain')
    expect(tagged.recordMesgs?.[0]?.positionLat).toBe(0)
  })

  it('leaves out the seconds of a pause so the gap is in the file', () => {
    const a = makeActivity('ride', 6, true)
    a.paused.set([0, 0, 1, 1, 0, 0])
    const records = decode(encodeFit(a)).messages.recordMesgs ?? []
    expect(records.map((r) => r.timestamp)).toEqual([
      new Date(START_MS),
      new Date(START_MS + 1000),
      new Date(START_MS + 4000),
      new Date(START_MS + 5000),
    ])
    expect(decode(encodeFit(a)).messages.sessionMesgs?.[0]?.totalElapsedTime).toBe(6)
  })

  it('encodes an empty activity with zero totals and no records', () => {
    const empty = makeActivity('run', 0, false)
    const { messages, errors } = decode(encodeFit(empty))
    expect(errors).toEqual([])
    expect(messages.recordMesgs).toBeUndefined()
    expect(messages.sessionMesgs?.[0]?.totalElapsedTime).toBe(0)
    expect(messages.sessionMesgs?.[0]?.totalDistance).toBe(0)
  })
})
