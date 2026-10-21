import { Encoder } from '@garmin/fitsdk'
import type { FileIdMesg, RecordMesg, SessionMesg, SportMesg, Types } from '@garmin/fitsdk'

/** Test-only builder for FIT files with several sessions, loose records and odd sport fields. */

export interface TestRecord {
  /** Epoch milliseconds, whole seconds. */
  tMs: number
  speed?: number
  altitude?: number
  heartRate?: number
  power?: number
  /** Writes a position so the record counts as outdoor. */
  gps?: boolean
}

export interface TestSession {
  /** Omit to write a session with no sport. */
  sport?: Types.Sport
  subSport?: Types.SubSport
  startMs: number
  durationS: number
  records: TestRecord[]
}

export interface TestFile {
  /** Written as a sport message before any record. */
  sportMesg?: Types.Sport
  /** Records written with no session message after them. */
  looseRecords?: TestRecord[]
  sessions?: TestSession[]
}

export function buildFit(file: TestFile): Uint8Array {
  const encoder = new Encoder()
  const fileId: FileIdMesg = {
    type: 'activity',
    manufacturer: 'development',
    product: 0,
    timeCreated: new Date(0),
  }
  encoder.onMesg(0, fileId)
  if (file.sportMesg !== undefined) {
    const sport: SportMesg = { sport: file.sportMesg }
    encoder.onMesg(12, sport)
  }
  for (const record of file.looseRecords ?? []) writeRecord(encoder, record)
  for (const session of file.sessions ?? []) {
    for (const record of session.records) writeRecord(encoder, record)
    const mesg: SessionMesg = {
      sport: session.sport,
      subSport: session.subSport,
      startTime: new Date(session.startMs),
      timestamp: new Date(session.startMs + session.durationS * 1000),
      totalElapsedTime: session.durationS,
      totalTimerTime: session.durationS,
    }
    encoder.onMesg(18, mesg)
  }
  return encoder.close()
}

function writeRecord(encoder: Encoder, record: TestRecord): void {
  const mesg: RecordMesg = { timestamp: new Date(record.tMs) }
  if (record.gps) mesg.positionLat = 1
  if (record.speed !== undefined) mesg.enhancedSpeed = record.speed
  if (record.altitude !== undefined) mesg.enhancedAltitude = record.altitude
  if (record.heartRate !== undefined) mesg.heartRate = record.heartRate
  if (record.power !== undefined) mesg.power = record.power
  encoder.onMesg(20, mesg)
}

/** One record per second over [startMs, startMs + durationS), with the given field values. */
export function secondly(
  startMs: number,
  durationS: number,
  fields: Omit<TestRecord, 'tMs'> = {},
): TestRecord[] {
  return Array.from({ length: durationS }, (_, t) => ({ ...fields, tMs: startMs + t * 1000 }))
}
