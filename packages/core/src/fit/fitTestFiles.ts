import {
  FILE_TYPE,
  FIT_EPOCH_OFFSET_S,
  EVENT,
  EVENT_TYPE,
  SPORT,
  SUB_SPORT,
} from './protocol/profile'
import type { FitEventType, FitSportName, FitSubSportName } from './protocol/profile'
import {
  EVENT_LAYOUT,
  FILE_ID_LAYOUT,
  RECORD_LAYOUT,
  SESSION_LAYOUT,
  LAP_LAYOUT,
  SPORT_LAYOUT,
} from './protocol/layouts'
import { FitWriter } from './protocol/writer'

/** Test-only builder for FIT files with several sessions, loose records and odd sport fields. */

export interface TestRecord {
  /** Epoch milliseconds, whole seconds. */
  tMs: number
  speed?: number
  altitude?: number
  heartRate?: number
  power?: number
  cadence?: number
  fractionalCadence?: number
  temperature?: number
  distance?: number
  /** Writes a position so the record counts as outdoor. */
  gps?: boolean
  /** Writes this position, in degrees, so the record has a route point. */
  position?: { lat: number; lon: number }
}

export interface TestSession {
  /** Omit to write a session with no sport. */
  sport?: FitSportName
  subSport?: FitSubSportName
  startMs: number
  durationS: number
  records: TestRecord[]
}

export interface TestFile {
  /** Written as a sport message before any record. */
  sportMesg?: FitSportName
  /** Records written with no session message after them. */
  looseRecords?: TestRecord[]
  sessions?: TestSession[]
  /** Timer events written independently of records, for pause-boundary parser fixtures. */
  timerEvents?: Array<{ tMs: number; eventType: FitEventType }>
  laps?: Array<{ startMs: number; endMs: number }>
}

/** Epoch milliseconds to whole seconds since the FIT epoch. */
function fitSeconds(tMs: number): number {
  return Math.floor(tMs / 1000) - FIT_EPOCH_OFFSET_S
}

export function buildFit(file: TestFile): Uint8Array {
  const writer = new FitWriter()
  writer.message(FILE_ID_LAYOUT, {
    type: FILE_TYPE.activity,
    manufacturer: 255,
    product: 0,
    timeCreated: 0,
  })
  if (file.sportMesg !== undefined) {
    writer.message(SPORT_LAYOUT, { sport: SPORT[file.sportMesg] })
  }
  for (const record of file.looseRecords ?? []) writeRecord(writer, record)
  for (const session of file.sessions ?? []) {
    for (const record of session.records) writeRecord(writer, record)
    writer.message(SESSION_LAYOUT, {
      sport: session.sport === undefined ? undefined : SPORT[session.sport],
      subSport: session.subSport === undefined ? undefined : SUB_SPORT[session.subSport],
      startTime: fitSeconds(session.startMs),
      timestamp: fitSeconds(session.startMs + session.durationS * 1000),
      totalElapsedTime: session.durationS * 1000,
      totalTimerTime: session.durationS * 1000,
    })
  }
  for (const timerEvent of file.timerEvents ?? []) {
    writer.message(EVENT_LAYOUT, {
      timestamp: fitSeconds(timerEvent.tMs),
      event: EVENT.timer,
      eventType: EVENT_TYPE[timerEvent.eventType],
    })
  }
  for (const [messageIndex, lap] of (file.laps ?? []).entries()) {
    writer.message(LAP_LAYOUT, {
      messageIndex,
      event: EVENT.lap,
      eventType: EVENT_TYPE.stop,
      startTime: fitSeconds(lap.startMs),
      timestamp: fitSeconds(lap.endMs),
      totalElapsedTime: lap.endMs - lap.startMs,
      totalTimerTime: lap.endMs - lap.startMs,
    })
  }
  return writer.finish()
}

/** FIT positions are signed 32-bit semicircles: 2^31 of them span half a turn. */
function toSemicircles(degrees: number): number {
  return Math.round((degrees * 2 ** 31) / 180)
}

function writeRecord(writer: FitWriter, record: TestRecord): void {
  writer.message(RECORD_LAYOUT, {
    timestamp: fitSeconds(record.tMs),
    positionLat: record.position ? toSemicircles(record.position.lat) : record.gps ? 1 : undefined,
    positionLong: record.position ? toSemicircles(record.position.lon) : undefined,
    enhancedSpeed: record.speed === undefined ? undefined : record.speed * 1000,
    enhancedAltitude: record.altitude === undefined ? undefined : (record.altitude + 500) * 5,
    heartRate: record.heartRate,
    power: record.power,
    cadence: record.cadence,
    fractionalCadence: record.fractionalCadence,
    temperature: record.temperature,
    distance: record.distance === undefined ? undefined : record.distance * 100,
  })
}

/** One record per second over [startMs, startMs + durationS), with the given field values. */
export function secondly(
  startMs: number,
  durationS: number,
  fields: Omit<TestRecord, 'tMs'> = {},
): TestRecord[] {
  return Array.from({ length: durationS }, (_, t) => ({ ...fields, tMs: startMs + t * 1000 }))
}
