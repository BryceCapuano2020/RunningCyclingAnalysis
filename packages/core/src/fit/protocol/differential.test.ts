/**
 * Differential test: the in-house decoder and encoder against the Garmin FIT SDK, the reference
 * implementation. This is the only file in the library that imports the SDK, and the SDK is a
 * devDependency used for nothing else.
 */
import { CrcCalculator, Decoder, Encoder, Profile, Stream } from '@garmin/fitsdk'
import type { EventMesg, FileIdMesg, RecordMesg, SessionMesg, SportMesg } from '@garmin/fitsdk'
import { describe, expect, it } from 'vitest'
import type { Activity } from '../../types'
import { encodeFit } from '../encode'
import { decodeFit } from './decode'
import { crc16 } from './crc'
import { EVENT, EVENT_TYPE, SPORT, SUB_SPORT } from './profile'

/** A seeded PRNG (mulberry32) so the 350 generated files are the same on every run. */
function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const START_S = Date.UTC(2021, 3, 1) / 1000

function between(rng: () => number, low: number, high: number): number {
  return low + Math.floor(rng() * (high - low + 1))
}

function pick<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)]!
}

/** A random Activity written by the in-house encoder. */
function randomActivity(rng: () => number, index: number): Activity {
  const n = between(rng, 60, 400)
  const speed = new Float64Array(n)
  const distance = new Float64Array(n)
  const altitude = new Float64Array(n)
  const heartRate = new Float64Array(n)
  const power = new Float64Array(n)
  const paused = new Uint8Array(n)
  const pauseFrom = rng() < 0.3 ? between(rng, 0, n - 1) : -1
  let total = 0
  for (let i = 0; i < n; i++) {
    const isPaused = i >= pauseFrom && i < pauseFrom + 5
    paused[i] = isPaused ? 1 : 0
    const v = isPaused ? 0 : Math.round(rng() * 12000) / 1000
    speed[i] = v
    total += v
    distance[i] = Math.round(total * 100) / 100
    altitude[i] = Math.round((rng() * 2500 - 500) * 5) / 5
    heartRate[i] = rng() < 0.1 ? NaN : between(rng, 30, 230)
    power[i] = rng() < 0.4 ? NaN : between(rng, 0, 1500)
  }
  return {
    id: `generated-${index}`,
    name: `generated-${index}`,
    sport: rng() < 0.5 ? 'run' : 'ride',
    startMs: START_S * 1000 + between(rng, 0, 100_000) * 1000,
    n,
    speed,
    distance,
    altitude,
    heartRate,
    power,
    paused,
    hasPower: true,
    hasHeartRate: true,
    hasAltitude: true,
    indoor: false,
  }
}

const SDK_SPORTS = [
  'running',
  'cycling',
  'fitnessEquipment',
  'swimming',
  'eBiking',
  'generic',
] as const
const SDK_SUB_SPORTS = [
  'treadmill',
  'indoorCycling',
  'virtualActivity',
  'trail',
  'eBikeMountain',
] as const
const TIMER_TYPES = ['start', 'stop', 'stopAll', 'stopDisable', 'stopDisableAll'] as const

/** A random multi-session file written by the Garmin encoder. */
function sdkFile(rng: () => number): Uint8Array {
  const encoder = new Encoder()
  const fileId: FileIdMesg = {
    type: 'activity',
    manufacturer: 'development',
    product: 0,
    timeCreated: new Date(START_S * 1000),
  }
  encoder.onMesg(0, fileId)
  if (rng() < 0.5) {
    const sport: SportMesg = { sport: pick(rng, SDK_SPORTS), subSport: pick(rng, SDK_SUB_SPORTS) }
    encoder.onMesg(12, sport)
  }
  let at = START_S + between(rng, 0, 100_000)
  const sessions = between(rng, 1, 3)
  for (let s = 0; s < sessions; s++) {
    const count = between(rng, 1, 80)
    const sessionStart = at
    for (let k = 0; k < count; k++) {
      at += between(rng, 1, 3)
      const record: RecordMesg = { timestamp: new Date(at * 1000) }
      if (rng() < 0.7) record.heartRate = between(rng, 0, 254)
      if (rng() < 0.7) record.power = between(rng, 0, 65000)
      if (rng() < 0.7) record.distance = between(rng, 0, 1_000_000) / 100
      // Devices write one speed field per record. The SDK reports field 6 as enhancedSpeed when it
      // is present, so writing both would compare the SDK's rule with ours rather than the data.
      const speedMs = between(rng, 0, 30_000) / 1000
      const enhanced = rng() < 0.5
      if (enhanced) record.enhancedSpeed = speedMs
      else if (rng() < 0.25) record.speed = speedMs
      if (rng() < 0.7) record.enhancedAltitude = between(rng, 0, 20_000) / 5 - 500
      if (rng() < 0.5) record.positionLat = between(rng, -2_000_000_000, 2_000_000_000)
      encoder.onMesg(20, record)
    }
    const session: SessionMesg = {
      startTime: new Date(sessionStart * 1000),
      timestamp: new Date(at * 1000),
      totalElapsedTime: at - sessionStart,
      sport: pick(rng, SDK_SPORTS),
      subSport: rng() < 0.5 ? pick(rng, SDK_SUB_SPORTS) : undefined,
    }
    encoder.onMesg(18, session)
    at += between(rng, 1, 600)
  }
  for (let e = between(rng, 0, 4); e > 0; e--) {
    const event: EventMesg = {
      timestamp: new Date((START_S + between(rng, 0, 50_000)) * 1000),
      event: 'timer',
      eventType: pick(rng, TIMER_TYPES),
    }
    encoder.onMesg(21, event)
  }
  return encoder.close()
}

/** One record as the comparison sees it: the speed is the enhanced field, or else the plain one. */
interface Rec {
  timestampMs: number | undefined
  positionLat: number | undefined
  positionLong: number | undefined
  altitude: number | undefined
  heartRate: number | undefined
  distance: number | undefined
  power: number | undefined
  enhancedAltitude: number | undefined
  speedMs: number | undefined
}

function comparable(r: {
  timestampMs: number | undefined
  positionLat: number | undefined
  positionLong: number | undefined
  altitude: number | undefined
  heartRate: number | undefined
  distance: number | undefined
  power: number | undefined
  enhancedAltitude: number | undefined
  speed: number | undefined
  enhancedSpeed: number | undefined
}): Rec {
  return {
    timestampMs: r.timestampMs,
    positionLat: r.positionLat,
    positionLong: r.positionLong,
    altitude: r.altitude,
    heartRate: r.heartRate,
    distance: r.distance,
    power: r.power,
    enhancedAltitude: r.enhancedAltitude,
    speedMs: r.enhancedSpeed ?? r.speed,
  }
}

/** The analysis view of the SDK's decode, in the same shape as decodeFit's messages. */
function sdkView(bytes: Uint8Array) {
  const decoder = new Decoder(Stream.fromByteArray(bytes))
  const { messages, errors } = decoder.read()
  // Dates come back for the timestamps the encoders wrote; system times are not generated.
  const ms = (time: unknown) => (time instanceof Date ? time.getTime() : undefined)
  return {
    errors,
    records: (messages.recordMesgs ?? []).map((r) =>
      comparable({
        timestampMs: ms(r.timestamp),
        positionLat: r.positionLat,
        positionLong: r.positionLong,
        altitude: r.altitude,
        heartRate: r.heartRate,
        distance: r.distance,
        speed: r.speed,
        power: r.power,
        enhancedSpeed: r.enhancedSpeed,
        enhancedAltitude: r.enhancedAltitude,
      }),
    ),
    sessions: (messages.sessionMesgs ?? []).map((s) => ({
      timestampMs: ms(s.timestamp),
      startTimeMs: ms(s.startTime),
      totalElapsedTime: s.totalElapsedTime,
      totalTimerTime: s.totalTimerTime,
      totalDistance: s.totalDistance,
      avgHeartRate: s.avgHeartRate,
      avgPower: s.avgPower,
      sport: s.sport,
      subSport: s.subSport,
    })),
    sports: (messages.sportMesgs ?? []).map((s) => ({ sport: s.sport, subSport: s.subSport })),
    events: (messages.eventMesgs ?? []).map((e) => ({
      timestampMs: ms(e.timestamp),
      event: e.event,
      eventType: e.eventType,
    })),
  }
}

function ourView(bytes: Uint8Array) {
  const result = decodeFit(bytes)
  expect(result.ok).toBe(true)
  expect(result.crcValid).toBe(true)
  const { sessions, sports, events } = result.messages
  return { records: result.messages.records.map(comparable), sessions, sports, events }
}

describe('in-house decoder against the Garmin SDK', () => {
  it('decodes 300 files from the in-house encoder to the same messages as the SDK', () => {
    const rng = random(20240501)
    for (let i = 0; i < 300; i++) {
      const activity = randomActivity(rng, i)
      const bytes = encodeFit(activity, {
        gps: rng() < 0.5,
        subSport: rng() < 0.3 ? pick(rng, ['treadmill', 'eBikeMountain'] as const) : undefined,
      })
      const sdk = sdkView(bytes)
      expect(sdk.errors).toEqual([])
      const ours = ourView(bytes)
      expect(ours).toEqual({
        records: sdk.records,
        sessions: sdk.sessions,
        sports: sdk.sports,
        events: sdk.events,
      })
    }
  })

  it('decodes 50 files from the Garmin encoder to the same messages as the in-house decoder', () => {
    const rng = random(7742)
    for (let i = 0; i < 50; i++) {
      const bytes = sdkFile(rng)
      const sdk = sdkView(bytes)
      expect(sdk.errors).toEqual([])
      const ours = ourView(bytes)
      expect(ours).toEqual({
        records: sdk.records,
        sessions: sdk.sessions,
        sports: sdk.sports,
        events: sdk.events,
      })
    }
  })

  it('computes the same file CRC as the SDK, and writes the same CRC the SDK checks', () => {
    const rng = random(99)
    for (let i = 0; i < 20; i++) {
      const bytes = sdkFile(rng)
      const end = bytes.length - 2
      expect(crc16(bytes, 0, end)).toBe(CrcCalculator.calculateCRC(bytes, 0, end))
      const generated = encodeFit(randomActivity(rng, i))
      const generatedEnd = generated.length - 2
      expect(new Decoder(Stream.fromByteArray(generated)).checkIntegrity()).toBe(true)
      expect(crc16(generated, 0, generatedEnd)).toBe(
        CrcCalculator.calculateCRC(generated, 0, generatedEnd),
      )
    }
  })

  it('has the same sport, sub-sport, event and event-type numbers as the profile', () => {
    const profile = Profile.types as unknown as Record<string, Record<number, string>>
    const check = (table: Record<string, number>, names: Record<number, string>) => {
      for (const [name, value] of Object.entries(table)) expect(names[value]).toBe(name)
    }
    check(SPORT, profile.sport!)
    check(SUB_SPORT, profile.subSport!)
    check(EVENT, profile.event!)
    check(EVENT_TYPE, profile.eventType!)
  })
})
