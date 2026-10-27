import type { Activity } from '../types'
import {
  ACTIVITY_LAYOUT,
  EVENT_LAYOUT,
  FILE_ID_LAYOUT,
  LAP_LAYOUT,
  RECORD_LAYOUT,
  SESSION_LAYOUT,
} from './protocol/layouts'
import { FitWriter } from './protocol/writer'
import {
  EVENT,
  EVENT_TYPE,
  FILE_TYPE,
  FIT_EPOCH_OFFSET_S,
  SPORT,
  SUB_SPORT,
} from './protocol/profile'
import type { FitSubSportName } from './protocol/profile'

export interface EncodeOptions {
  /** Written to the session, for example `treadmill` or `eBikeMountain`. */
  subSport?: FitSubSportName
  /**
   * Writes a placeholder position (0, 0) to every record, as a watch with GPS would. The Activity
   * has no coordinates, so this carries no location. Not needed for the file to read as outdoor.
   */
  gps?: boolean
}

/**
 * Writes a single-lap FIT activity with one record per second. Missing (NaN) fields are omitted,
 * and seconds inside a pause are left out so the pause survives the round trip.
 */
export function encodeFit(activity: Activity, opts: EncodeOptions = {}): Uint8Array {
  const writer = new FitWriter()
  const { n } = activity
  const startFit = Math.floor(activity.startMs / 1000) - FIT_EPOCH_OFFSET_S
  const endFit = startFit + n
  const sport = { run: SPORT.running, ride: SPORT.cycling }[activity.sport]
  const totalDistance = n > 0 ? (sample(activity.distance, n - 1) ?? 0) : 0
  const totalMs = n * 1000

  writer.message(FILE_ID_LAYOUT, {
    type: FILE_TYPE.activity,
    manufacturer: 255,
    product: 0,
    timeCreated: startFit,
  })

  const timer = (timestamp: number, eventType: number) => {
    writer.message(EVENT_LAYOUT, { timestamp, event: EVENT.timer, eventType })
  }
  timer(startFit, EVENT_TYPE.start)
  for (let i = 0; i < n;) {
    if (activity.paused[i] === 1) {
      const pauseStart = i
      while (i < n && activity.paused[i] === 1) i++
      timer(startFit + pauseStart, EVENT_TYPE.stop)
      if (i < n) timer(startFit + i, EVENT_TYPE.start)
      continue
    }
    writer.message(RECORD_LAYOUT, {
      timestamp: startFit + i,
      positionLat: opts.gps ? 0 : undefined,
      positionLong: opts.gps ? 0 : undefined,
      distance: scaled(sample(activity.distance, i), 100),
      enhancedSpeed: scaled(sample(activity.speed, i), 1000),
      enhancedAltitude: scaled(sample(activity.altitude, i), 5, 500),
      heartRate: sample(activity.heartRate, i),
      power: sample(activity.power, i),
    })
    i++
  }
  timer(endFit, EVENT_TYPE.stop)

  writer.message(LAP_LAYOUT, {
    messageIndex: 0,
    event: EVENT.lap,
    eventType: EVENT_TYPE.stop,
    startTime: startFit,
    timestamp: endFit,
    totalElapsedTime: totalMs,
    totalTimerTime: totalMs,
    totalDistance: scaled(totalDistance, 100),
  })

  writer.message(SESSION_LAYOUT, {
    messageIndex: 0,
    event: EVENT.session,
    eventType: EVENT_TYPE.stop,
    startTime: startFit,
    timestamp: endFit,
    sport,
    subSport: opts.subSport === undefined ? undefined : SUB_SPORT[opts.subSport],
    totalElapsedTime: totalMs,
    totalTimerTime: totalMs,
    totalDistance: scaled(totalDistance, 100),
    firstLapIndex: 0,
    numLaps: 1,
  })

  writer.message(ACTIVITY_LAYOUT, {
    timestamp: endFit,
    totalTimerTime: totalMs,
    numSessions: 1,
    type: 0,
    event: EVENT.activity,
    eventType: EVENT_TYPE.stop,
  })

  return writer.finish()
}

function sample(xs: Float64Array, i: number): number | undefined {
  const value = xs[i]
  return value !== undefined && Number.isFinite(value) ? value : undefined
}

/** A value in SI units as the raw integer the profile stores: (value + offset) * scale. */
function scaled(value: number | undefined, scale: number, offset = 0): number | undefined {
  return value === undefined ? undefined : (value + offset) * scale
}
