import { BASE } from '../../fit/protocol/baseTypes'
import {
  ACTIVITY_LAYOUT,
  EVENT_LAYOUT,
  FILE_ID_LAYOUT,
  LAP_LAYOUT,
  RECORD_LAYOUT,
  SESSION_LAYOUT,
} from '../../fit/protocol/layouts'
import {
  EVENT,
  EVENT_TYPE,
  FILE_TYPE,
  FIT_EPOCH_OFFSET_S,
  MESG,
  SPORT,
} from '../../fit/protocol/profile'
import { defineLayout, FitWriter } from '../../fit/protocol/writer'
import { encodeGpx } from '../../gpx/encode'
import { parseActivityFile } from '../../import'
import { encodeTcx } from '../../tcx/encode'
import type { Activity } from '../../types'
import { syntheticActivity } from './syntheticActivity'

/**
 * Files that each carry a local time, so a test can read them with the day shift on and off. Built from a
 * seeded synthetic run: no real data.
 */

/** 2026-03-14T20:00:00Z, a Saturday evening in UTC. */
export const EVENING_UTC_MS = Date.UTC(2026, 2, 14, 20, 0, 0)
/** 2026-03-14T12:00:00Z. */
export const NOON_UTC_MS = Date.UTC(2026, 2, 14, 12, 0, 0)

/** A run of five minutes at 4 m/s starting at `startMs`. */
export function shortRun(startMs: number): Activity {
  return syntheticActivity({ id: 'local-day', n: 300, startMs })
}

/** The activity message with the field that holds the device's local time (global 34, field 5). */
const LOCAL_ACTIVITY_LAYOUT = defineLayout(MESG.activity, [
  ...ACTIVITY_LAYOUT.fields,
  { name: 'localTimestamp', num: 5, base: BASE.uint32 },
])

/**
 * A FIT file of the run whose activity message says the local time is `offsetS` seconds from UTC. With
 * `offsetS` null the activity message has no local time, as a device that does not write one. Position is
 * the (0, 0) placeholder, so the run reads as outdoor and carries no location.
 */
export function fitWithLocalTime(activity: Activity, offsetS: number | null): Uint8Array {
  const writer = new FitWriter()
  const startFit = Math.floor(activity.startMs / 1000) - FIT_EPOCH_OFFSET_S
  const endFit = startFit + activity.n
  const totalMs = activity.n * 1000
  const totalDistance = Math.round((activity.distance[activity.n - 1] ?? 0) * 100)
  writer.message(FILE_ID_LAYOUT, {
    type: FILE_TYPE.activity,
    manufacturer: 255,
    product: 0,
    timeCreated: startFit,
  })
  writer.message(EVENT_LAYOUT, {
    timestamp: startFit,
    event: EVENT.timer,
    eventType: EVENT_TYPE.start,
  })
  for (let i = 0; i < activity.n; i++) {
    writer.message(RECORD_LAYOUT, {
      timestamp: startFit + i,
      positionLat: 0,
      positionLong: 0,
      distance: Math.round(activity.distance[i]! * 100),
      enhancedSpeed: Math.round(activity.speed[i]! * 1000),
      enhancedAltitude: Math.round((activity.altitude[i]! + 500) * 5),
      heartRate: activity.heartRate[i],
    })
  }
  writer.message(EVENT_LAYOUT, {
    timestamp: endFit,
    event: EVENT.timer,
    eventType: EVENT_TYPE.stop,
  })
  writer.message(LAP_LAYOUT, {
    messageIndex: 0,
    event: EVENT.lap,
    eventType: EVENT_TYPE.stop,
    startTime: startFit,
    timestamp: endFit,
    totalElapsedTime: totalMs,
    totalTimerTime: totalMs,
    totalDistance,
  })
  writer.message(SESSION_LAYOUT, {
    messageIndex: 0,
    event: EVENT.session,
    eventType: EVENT_TYPE.stop,
    startTime: startFit,
    timestamp: endFit,
    sport: SPORT.running,
    totalElapsedTime: totalMs,
    totalTimerTime: totalMs,
    totalDistance,
    firstLapIndex: 0,
    numLaps: 1,
  })
  const message = {
    timestamp: endFit,
    totalTimerTime: totalMs,
    numSessions: 1,
    type: 0,
    event: EVENT.activity,
    eventType: EVENT_TYPE.stop,
  }
  if (offsetS === null) writer.message(ACTIVITY_LAYOUT, message)
  else writer.message(LOCAL_ACTIVITY_LAYOUT, { ...message, localTimestamp: endFit + offsetS })
  return writer.finish()
}

/** The file's text with every `Z` time rewritten as the wall clock `offsetMin` minutes from UTC. */
export function withZoneDesignator(bytes: Uint8Array, offsetMin: number): Uint8Array {
  const sign = offsetMin < 0 ? '-' : '+'
  const abs = Math.abs(offsetMin)
  const hours = String(Math.floor(abs / 60)).padStart(2, '0')
  const designator = `${sign}${hours}:${String(abs % 60).padStart(2, '0')}`
  const text = new TextDecoder()
    .decode(bytes)
    .replace(
      /(<(?:time|Time)>)(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(\.\d+)?Z(<\/(?:time|Time)>)/g,
      (_all, open: string, wall: string, fraction: string | undefined, close: string) => {
        const local = new Date(Date.parse(`${wall}Z`) + offsetMin * 60_000)
        return `${open}${local.toISOString().slice(0, 19)}${fraction ?? ''}${designator}${close}`
      },
    )
  return new TextEncoder().encode(text)
}

export const gpxBytes = (activity: Activity): Uint8Array => encodeGpx(activity)
export const tcxBytes = (activity: Activity): Uint8Array => encodeTcx(activity, { gps: true })

/** The file read as the importer reads it; throws if it does not read. */
export function readFile(bytes: Uint8Array, name: string): Activity {
  const parsed = parseActivityFile(bytes, name, undefined, { activityType: 'Run' })
  const first = parsed.ok ? parsed.activities[0] : undefined
  if (first === undefined) throw new Error(`${name} did not read`)
  return first
}
