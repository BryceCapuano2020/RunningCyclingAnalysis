import { describe, expect, it } from 'vitest'
import { definition, fitFile, int } from './fitBytes'
import { decodeFit, DEFAULT_MAX_RECORDS } from './decode'
import { FIELD, MESG } from './profile'

const FIT_EPOCH_S = 631_065_600
/** A time in FIT seconds, well above the system-time limit: 2021-01-08 or so. */
const RAW = 1_100_000_000
/** The epoch milliseconds of a time in FIT seconds. */
const epochMs = (raw: number) => (raw + FIT_EPOCH_S) * 1000
const HEART_RATE = [3, 1, 0x02] as const
const TIMESTAMP = [253, 4, 0x86] as const
const POWER = [7, 2, 0x84] as const
const ALTITUDE = [78, 4, 0x86] as const
const DISTANCE = [5, 4, 0x86] as const
const ENHANCED_SPEED = [73, 4, 0x86] as const

/** One record message with the given field values, using the layout defined as local type 0. */
function record(values: number[]): number[] {
  return [0, ...values]
}

const RECORD_DEF = definition(0, MESG.record, [
  TIMESTAMP,
  HEART_RATE,
  POWER,
  ALTITUDE,
  DISTANCE,
  ENHANCED_SPEED,
])

function recordBytes(time: number, hr: number, power: number, altitudeRaw: number): number[] {
  return record([
    ...int(time, 4),
    hr,
    ...int(power, 2),
    ...int(altitudeRaw, 4),
    ...int(0xffffffff, 4),
    ...int(0xffffffff, 4),
  ])
}

describe('decodeFit records', () => {
  it('converts timestamps, scales and offsets to the units the analysis uses', () => {
    const t = RAW + 1000
    const data = [
      ...RECORD_DEF,
      ...record([
        ...int(t, 4),
        150,
        ...int(250, 2),
        ...int(3000, 4), // altitude: 3000 / 5 - 500 = 100 m
        ...int(12345, 4), // distance: 123.45 m
        ...int(3500, 4), // enhanced speed: 3.5 m/s
      ]),
    ]
    const result = decodeFit(fitFile(data))
    expect(result.ok).toBe(true)
    const [r] = result.messages.records
    expect(r?.timestampMs).toBe(epochMs(t))
    expect(r?.heartRate).toBe(150)
    expect(r?.power).toBe(250)
    expect(r?.enhancedAltitude).toBe(100)
    expect(r?.distance).toBeCloseTo(123.45, 10)
    expect(r?.enhancedSpeed).toBe(3.5)
  })

  it('reads a value equal to its invalid marker as absent', () => {
    const data = [...RECORD_DEF, ...recordBytes(RAW + 5, 0xff, 0xffff, 0xffffffff)]
    const [r] = decodeFit(fitFile(data)).messages.records
    expect(r?.heartRate).toBeUndefined()
    expect(r?.power).toBeUndefined()
    expect(r?.enhancedAltitude).toBeUndefined()
    expect(r?.timestampMs).toBe(epochMs(RAW + 5))
  })

  it('treats a time below 0x10000000 as system time, not a date', () => {
    const data = [...RECORD_DEF, ...recordBytes(0x0fffffff, 100, 200, 3000)]
    const [r] = decodeFit(fitFile(data)).messages.records
    expect(r?.timestampMs).toBeUndefined()
  })

  it('reads a time of exactly 0x10000000 as a date', () => {
    const data = [...RECORD_DEF, ...recordBytes(0x10000000, 100, 200, 3000)]
    const [r] = decodeFit(fitFile(data)).messages.records
    expect(r?.timestampMs).toBe(epochMs(0x10000000))
  })

  it('applies the 500 m offset to the altitude field, as to enhanced altitude', () => {
    // Raw 3000 at scale 5 is 600 m, less the 500 m offset, so 100 m.
    const ALTITUDE_FIELD = [2, 4, 0x86] as const
    const data = [
      ...definition(0, MESG.record, [TIMESTAMP, ALTITUDE_FIELD]),
      ...record([...int(RAW, 4), ...int(3000, 4)]),
    ]
    const [r] = decodeFit(fitFile(data)).messages.records
    expect(r?.altitude).toBe(100)
  })

  it('reports when decoding stops at the record limit, counting while it decodes', () => {
    const data = [...RECORD_DEF]
    for (let i = 0; i < 10; i++) data.push(...recordBytes(RAW + i, 100, 200, 3000))
    const result = decodeFit(fitFile(data), { maxRecords: 5 })
    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(['Record count exceeds the 5-record limit'])
    expect(result.recordCount).toBe(6)
    expect(result.messages.records.length).toBe(5)
  })

  it('uses the two-million record limit by default', () => {
    expect(DEFAULT_MAX_RECORDS).toBe(2_000_000)
  })

  it('reports a truncated file and an unchecked CRC', () => {
    const data = [...RECORD_DEF, ...recordBytes(RAW + 1, 100, 200, 3000)]
    const file = fitFile(data)
    const result = decodeFit(file.slice(0, file.length - 4))
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('File is truncated')
    expect(result.crcValid).toBe(false)
  })

  it('returns a failed result, never an exception, for input that is not bytes', () => {
    const result = decodeFit(null as unknown as Uint8Array)
    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(['Could not decode FIT data'])
  })
})

describe('decodeFit other messages', () => {
  it('maps sport and sub-sport numbers to names', () => {
    const data = [
      ...definition(0, MESG.sport, [
        [0, 1, 0x00],
        [1, 1, 0x00],
      ]),
      0,
      5,
      17,
    ]
    const [sport] = decodeFit(fitFile(data)).messages.sports
    expect(sport).toEqual({ sport: 'swimming', subSport: 'lapSwimming' })
  })

  it('leaves a sport number it does not know undefined', () => {
    const data = [...definition(0, MESG.sport, [[0, 1, 0x00]]), 0, 200]
    expect(decodeFit(fitFile(data)).messages.sports[0]?.sport).toBeUndefined()
  })

  it('reads the session sport, sub-sport, times and elapsed seconds', () => {
    const start = RAW + 100
    const data = [
      ...definition(0, MESG.session, [
        TIMESTAMP,
        [2, 4, 0x86],
        [7, 4, 0x86],
        [5, 1, 0x00],
        [6, 1, 0x00],
      ]),
      0,
      ...int(start + 60, 4),
      ...int(start, 4),
      ...int(60_500, 4),
      2,
      47,
    ]
    const [session] = decodeFit(fitFile(data)).messages.sessions
    expect(session).toEqual({
      timestampMs: epochMs(start + 60),
      startTimeMs: epochMs(start),
      totalElapsedTime: 60.5,
      sport: 'cycling',
      subSport: 'eBikeMountain',
    })
  })

  it('reads the file type and a timer start event', () => {
    const data = [
      ...definition(0, MESG.fileId, [[0, 1, 0x00]]),
      0,
      4,
      ...definition(1, MESG.event, [TIMESTAMP, [0, 1, 0x00], [1, 1, 0x00]]),
      1,
      ...int(RAW + 9, 4),
      0,
      0,
    ]
    const result = decodeFit(fitFile(data))
    expect(result.messages.fileId).toEqual({ type: 4 })
    expect(result.messages.events).toEqual([
      { timestampMs: epochMs(RAW + 9), event: 'timer', eventType: 'start' },
    ])
  })

  it('reads only the first file of a chained pair', () => {
    const data = [...definition(0, MESG.fileId, [[0, 1, 0x00]]), 0, 4]
    const second = [...definition(0, MESG.fileId, [[0, 1, 0x00]]), 0, 2]
    const file = Uint8Array.from([...fitFile(data), ...fitFile(second)])
    const result = decodeFit(file)
    expect(result.messages.fileId?.type).toBe(4)
    expect(result.warnings).toEqual(['trailing data'])
  })

  it('exposes the profile field numbers it reads', () => {
    expect(FIELD.timestamp).toBe(253)
    expect(FIELD.enhancedAltitude).toBe(78)
  })
})
