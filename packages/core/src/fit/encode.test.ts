import { describe, expect, it } from 'vitest'
import type { Activity, Sport } from '../types'
import { encodeFit } from './encode'
import { decodeFit } from './protocol/decode'
import { isFitFile, scanFit } from './protocol/reader'
import type { FitMessage } from './protocol/reader'
import { MESG } from './protocol/profile'

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

/** Every data message of one global message number, read without interpretation. */
function rawMessages(bytes: Uint8Array, globalNum: number): FitMessage[] {
  const out: FitMessage[] = []
  scanFit(bytes, (message) => {
    if (message.globalNum === globalNum) out.push(message)
    return true
  })
  return out
}

function decode(bytes: Uint8Array) {
  const result = decodeFit(bytes)
  if (!result.ok) throw new Error(result.errors.join('; '))
  return result.messages
}

describe('encodeFit', () => {
  it('writes a valid FIT file with one record per second', () => {
    const bytes = encodeFit(makeActivity('ride', 5, true))
    expect(isFitFile(bytes)).toBe(true)
    const result = decodeFit(bytes)
    expect(result.ok).toBe(true)
    expect(result.crcValid).toBe(true)
    expect(result.messages.fileId?.type).toBe(4)
    expect(result.messages.records.length).toBe(5)
    expect(result.messages.sessions.length).toBe(1)
    expect(rawMessages(bytes, MESG.lap).length).toBe(1)
    expect(rawMessages(bytes, MESG.activity).length).toBe(1)
  })

  it('maps the ride and run sports to cycling and running', () => {
    expect(decode(encodeFit(makeActivity('ride', 3, true))).sessions[0]?.sport).toBe('cycling')
    expect(decode(encodeFit(makeActivity('run', 3, false))).sessions[0]?.sport).toBe('running')
  })

  it('writes the record fields and rounds heart rate and power to whole numbers', () => {
    const a = makeActivity('ride', 3, true)
    a.heartRate[1] = 143.6
    a.power[1] = 251.4
    const records = decode(encodeFit(a)).records
    expect(records[0]?.timestampMs).toBe(START_MS)
    expect(records[1]?.timestampMs).toBe(START_MS + 1000)
    expect(records[1]?.heartRate).toBe(144)
    expect(records[1]?.power).toBe(251)
    expect(records[2]?.enhancedSpeed).toBeCloseTo(a.speed[2] ?? NaN, 3)
    expect(records[2]?.distance).toBeCloseTo(a.distance[2] ?? NaN, 2)
    expect(records[2]?.enhancedAltitude).toBeCloseTo(a.altitude[2] ?? NaN, 1)
  })

  it('writes normalized run cadence as FIT cycles and reconstructs its fractional part', () => {
    const activity = makeActivity('run', 3, false)
    activity.cadence = new Float32Array([177, 177, 177])
    const records = decode(encodeFit(activity)).records
    expect(records[1]?.cadence).toBe(88)
    expect(records[1]?.fractionalCadence).toBe(0.5)
  })

  it('omits fields whose value is NaN', () => {
    const records = decode(encodeFit(makeActivity('run', 3, false))).records
    expect(records.length).toBe(3)
    for (const record of records) {
      expect(record.power).toBeUndefined()
      expect(record.heartRate).toBeDefined()
    }
  })

  it('writes the lap and session totals from the activity', () => {
    const a = makeActivity('ride', 10, true)
    const bytes = encodeFit(a)
    const session = rawMessages(bytes, MESG.session)[0]?.values
    const lap = rawMessages(bytes, MESG.lap)[0]?.values
    const activity = rawMessages(bytes, MESG.activity)[0]?.values
    expect(session?.get(7)).toBe(10_000)
    expect(session?.get(8)).toBe(10_000)
    expect(Number(session?.get(9)) / 100).toBeCloseTo(a.distance[9] ?? NaN, 2)
    expect(session?.get(26)).toBe(1)
    expect(lap?.get(7)).toBe(10_000)
    expect(Number(lap?.get(9)) / 100).toBeCloseTo(a.distance[9] ?? NaN, 2)
    expect(activity?.get(1)).toBe(1)
  })

  it('reports zero session distance when the last distance sample is unknown', () => {
    const a = makeActivity('ride', 4, true)
    a.distance[3] = NaN
    const session = rawMessages(encodeFit(a), MESG.session)[0]?.values
    expect(session?.get(9)).toBe(0)
  })

  it('writes the sub-sport and placeholder positions only when asked', () => {
    const a = makeActivity('ride', 3, true)
    const plain = decode(encodeFit(a))
    expect(plain.sessions[0]?.subSport).toBeUndefined()
    expect(plain.records[0]?.positionLat).toBeUndefined()

    const tagged = decode(encodeFit(a, { subSport: 'eBikeMountain', gps: true }))
    expect(tagged.sessions[0]?.subSport).toBe('eBikeMountain')
    expect(tagged.records[0]?.positionLat).toBe(0)
  })

  it('leaves out the seconds of a pause so the gap is in the file', () => {
    const a = makeActivity('ride', 6, true)
    a.paused.set([0, 0, 1, 1, 0, 0])
    const records = decode(encodeFit(a)).records
    expect(records.map((r) => r.timestampMs)).toEqual([
      START_MS,
      START_MS + 1000,
      START_MS + 4000,
      START_MS + 5000,
    ])
    expect(
      decode(encodeFit(a)).events.map((event) => [event.timestampMs, event.eventType]),
    ).toEqual([
      [START_MS, 'start'],
      [START_MS + 2000, 'stop'],
      [START_MS + 4000, 'start'],
      [START_MS + 6000, 'stop'],
    ])
    expect(decode(encodeFit(a)).sessions[0]?.totalElapsedTime).toBe(6)
  })

  it('encodes an empty activity with zero totals and no records', () => {
    const empty = makeActivity('run', 0, false)
    const bytes = encodeFit(empty)
    const messages = decode(bytes)
    expect(messages.records).toEqual([])
    expect(messages.sessions[0]?.totalElapsedTime).toBe(0)
    expect(rawMessages(bytes, MESG.session)[0]?.values.get(9)).toBe(0)
  })
})
