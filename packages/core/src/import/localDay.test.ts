import { describe, expect, it } from 'vitest'
import { decodeFit } from '../fit/protocol/decode'
import { FIT_EPOCH_OFFSET_S, SYSTEM_TIME_LIMIT_S } from '../fit/protocol/profile'
import {
  EVENING_UTC_MS,
  NOON_UTC_MS,
  fitWithLocalTime,
  gpxBytes,
  readFile,
  shortRun,
  tcxBytes,
  withZoneDesignator,
} from '../digest/test/gateLocalDay'
import {
  designatorOffsetS,
  fitOffsetAt,
  fitOffsetS,
  localDayFields,
  localDayShift,
} from './localDay'
import { isoZoneOffsetS } from './time'

const HOUR = 3600
const FIT_TIME = 1_000_000_000

describe('fitOffsetS', () => {
  it('is the local time less the time, rounded to the quarter hour', () => {
    expect(fitOffsetS(FIT_TIME, FIT_TIME + 9 * HOUR)).toBe(9 * HOUR)
    expect(fitOffsetS(FIT_TIME, FIT_TIME + 5.5 * HOUR)).toBe(5.5 * HOUR)
    expect(fitOffsetS(FIT_TIME, FIT_TIME - 7 * HOUR)).toBe(-7 * HOUR)
    // A device that rounds its clock to the second or two still lands on the zone.
    expect(fitOffsetS(FIT_TIME, FIT_TIME + 9 * HOUR + 40)).toBe(9 * HOUR)
    expect(fitOffsetS(FIT_TIME, FIT_TIME + 20700 - 100)).toBe(20700)
  })

  it('accepts from -12 h to +14 h and nothing beyond', () => {
    expect(fitOffsetS(FIT_TIME, FIT_TIME - 12 * HOUR)).toBe(-12 * HOUR)
    expect(fitOffsetS(FIT_TIME, FIT_TIME + 14 * HOUR)).toBe(14 * HOUR)
    expect(fitOffsetS(FIT_TIME, FIT_TIME - 12 * HOUR - 1800)).toBeUndefined()
    expect(fitOffsetS(FIT_TIME, FIT_TIME + 14 * HOUR + 1800)).toBeUndefined()
    expect(fitOffsetS(FIT_TIME, FIT_TIME + 20 * HOUR)).toBeUndefined()
  })

  it('gives none for a system time, which is a count since power-on and not a date', () => {
    expect(fitOffsetS(SYSTEM_TIME_LIMIT_S - 1, SYSTEM_TIME_LIMIT_S + 100)).toBeUndefined()
    expect(fitOffsetS(FIT_TIME, SYSTEM_TIME_LIMIT_S - 1)).toBeUndefined()
  })

  it('gives none when either time is missing', () => {
    expect(fitOffsetS(undefined, FIT_TIME)).toBeUndefined()
    expect(fitOffsetS(FIT_TIME, undefined)).toBeUndefined()
  })
})

describe('fitOffsetAt', () => {
  const END_1 = 1_000_000_000
  const END_2 = END_1 + 10 * 24 * HOUR
  const startOf = (fitS: number) => (fitS + FIT_EPOCH_OFFSET_S) * 1000
  const messages = [
    { timestampS: END_1, localTimestampS: END_1 + 1 * HOUR },
    { timestampS: END_2, localTimestampS: END_2 + 2 * HOUR },
  ]

  it('takes the activity message that closes the activity the start belongs to', () => {
    expect(fitOffsetAt(messages, startOf(END_1 - 600))).toBe(1 * HOUR)
    expect(fitOffsetAt(messages, startOf(END_1 + 600))).toBe(2 * HOUR)
  })

  it('takes the last message for a start after every one, and none without a message', () => {
    expect(fitOffsetAt(messages, startOf(END_2 + 600))).toBe(2 * HOUR)
    expect(fitOffsetAt([], startOf(END_1))).toBeUndefined()
  })
})

describe('localDayShift', () => {
  const at = (hour: number, minute = 0) => Date.UTC(2026, 2, 14, hour, minute)

  it('is the local date less the UTC date', () => {
    expect(localDayShift(at(20), 9 * HOUR)).toBe(1)
    expect(localDayShift(at(20), 5.5 * HOUR)).toBe(1)
    expect(localDayShift(at(12), 5.5 * HOUR)).toBe(0)
    expect(localDayShift(at(6, 30), -7 * HOUR)).toBe(-1)
    expect(localDayShift(at(20), 0)).toBe(0)
  })

  it('is 0 for every offset from -12 h to +11:59 at midday UTC', () => {
    for (let offset = -12 * HOUR; offset < 12 * HOUR; offset += 900) {
      expect(localDayShift(at(12), offset)).toBe(0)
    }
  })

  it('is always -1, 0 or +1 over the accepted range', () => {
    for (let hour = 0; hour < 24; hour++) {
      for (const offset of [-12 * HOUR, -3.5 * HOUR, 0, 5.75 * HOUR, 14 * HOUR]) {
        expect([-1, 0, 1]).toContain(localDayShift(at(hour), offset))
      }
    }
  })

  it('sets the field only when the file gave an offset', () => {
    expect(localDayFields(undefined, at(20))).toEqual({})
    expect(localDayFields(9 * HOUR, at(20))).toEqual({ localDayShift: 1 })
    expect(localDayFields(0, at(20))).toEqual({ localDayShift: 0 })
  })
})

describe('isoZoneOffsetS and designatorOffsetS', () => {
  it('reads a designator other than Z, and nothing for Z or no zone', () => {
    expect(isoZoneOffsetS('2026-03-14T23:00:00+02:00')).toBe(7200)
    expect(isoZoneOffsetS('2026-03-14T06:30:00.500-07:00')).toBe(-25200)
    expect(isoZoneOffsetS('2026-03-14T06:30:00+00:00')).toBe(0)
    expect(isoZoneOffsetS('2026-03-14T06:30:00Z')).toBeUndefined()
    expect(isoZoneOffsetS('2026-03-14T06:30:00z')).toBeUndefined()
    expect(isoZoneOffsetS('2026-03-14T06:30:00')).toBeUndefined()
    expect(isoZoneOffsetS('not a time')).toBeUndefined()
  })

  it('refuses a zone that is not a real one', () => {
    expect(designatorOffsetS(23 * HOUR)).toBeUndefined()
    expect(designatorOffsetS(7200)).toBe(7200)
    expect(designatorOffsetS(undefined)).toBeUndefined()
  })

  it('treats +00:00 and -00:00 as no zone, the same as Z', () => {
    expect(designatorOffsetS(isoZoneOffsetS('2026-03-14T06:30:00+00:00'))).toBeUndefined()
    expect(designatorOffsetS(isoZoneOffsetS('2026-03-14T06:30:00-00:00'))).toBeUndefined()
    expect(designatorOffsetS(isoZoneOffsetS('2026-03-14T06:30:00+00:30'))).toBe(1800)
  })
})

describe('what the importer reads from a file', () => {
  it('decodes the activity message with its local time', () => {
    const run = shortRun(EVENING_UTC_MS)
    const decoded = decodeFit(fitWithLocalTime(run, 9 * HOUR)).messages.activities[0]
    const end = Math.floor(run.startMs / 1000) - FIT_EPOCH_OFFSET_S + run.n
    expect(decoded).toEqual({ timestampS: end, localTimestampS: end + 9 * HOUR })
    expect(
      decodeFit(fitWithLocalTime(run, null)).messages.activities[0]?.localTimestampS,
    ).toBeUndefined()
  })

  it.each([
    [
      'O1 a FIT at +9 h and 20:00 UTC',
      () => fitWithLocalTime(shortRun(EVENING_UTC_MS), 9 * HOUR),
      'a.fit',
      1,
    ],
    [
      'O2 a FIT at +5:30 and 20:00 UTC',
      () => fitWithLocalTime(shortRun(EVENING_UTC_MS), 19_800),
      'a.fit',
      1,
    ],
    [
      'O2 a FIT at +5:30 and 12:00 UTC',
      () => fitWithLocalTime(shortRun(NOON_UTC_MS), 19_800),
      'a.fit',
      0,
    ],
    [
      'O3 a FIT whose local time is UTC',
      () => fitWithLocalTime(shortRun(EVENING_UTC_MS), 0),
      'a.fit',
      0,
    ],
    [
      'O4 a FIT with a local time out of range',
      () => fitWithLocalTime(shortRun(EVENING_UTC_MS), 20 * HOUR),
      'a.fit',
      undefined,
    ],
    [
      'a FIT with no local time',
      () => fitWithLocalTime(shortRun(EVENING_UTC_MS), null),
      'a.fit',
      undefined,
    ],
    [
      'O5 a GPX at +02:00 and 23:00 UTC',
      () => withZoneDesignator(gpxBytes(shortRun(Date.UTC(2026, 2, 14, 23))), 120),
      'a.gpx',
      1,
    ],
    ['O6 a GPX in UTC', () => gpxBytes(shortRun(EVENING_UTC_MS)), 'a.gpx', undefined],
    [
      'a GPX at +00:00',
      () => withZoneDesignator(gpxBytes(shortRun(EVENING_UTC_MS)), 0),
      'a.gpx',
      undefined,
    ],
    [
      'a GPX at -00:00',
      () =>
        new TextEncoder().encode(
          new TextDecoder()
            .decode(gpxBytes(shortRun(EVENING_UTC_MS)))
            .replace(/Z<\/time>/g, '-00:00</time>'),
        ),
      'a.gpx',
      undefined,
    ],
    [
      'a TCX at -07:00 and 06:30 UTC',
      () => withZoneDesignator(tcxBytes(shortRun(Date.UTC(2026, 2, 15, 6, 30))), -420),
      'a.tcx',
      -1,
    ],
    ['a TCX in UTC', () => tcxBytes(shortRun(EVENING_UTC_MS)), 'a.tcx', undefined],
    [
      'a TCX at +00:00',
      () => withZoneDesignator(tcxBytes(shortRun(EVENING_UTC_MS)), 0),
      'a.tcx',
      undefined,
    ],
  ] as const)('%s gives %s', (_name, bytes, file, shift) => {
    const activity = readFile(bytes(), file)
    expect(activity.localDayShift).toBe(shift)
    expect(Object.hasOwn(activity, 'localDayShift')).toBe(shift !== undefined)
  })

  it('keeps no offset anywhere on the activity', () => {
    const activity = readFile(fitWithLocalTime(shortRun(EVENING_UTC_MS), 9 * HOUR), 'a.fit')
    expect(JSON.stringify(Object.keys(activity))).not.toMatch(/offset|zone/i)
  })
})
