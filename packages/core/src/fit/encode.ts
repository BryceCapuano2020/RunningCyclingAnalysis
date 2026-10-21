import { Encoder } from '@garmin/fitsdk'
import type {
  ActivityMesg,
  FileIdMesg,
  LapMesg,
  RecordMesg,
  SessionMesg,
  Types,
} from '@garmin/fitsdk'
import type { Activity } from '../types'

/** FIT global message numbers (Profile.MesgNum). */
const MESG_FILE_ID = 0
const MESG_SESSION = 18
const MESG_LAP = 19
const MESG_RECORD = 20
const MESG_ACTIVITY = 34

export interface EncodeOptions {
  /** Written to the session, for example `treadmill` or `eBikeMountain`. */
  subSport?: Types.SubSport
  /**
   * Writes a placeholder position (0, 0) to every record so the file reads as outdoor. The
   * Activity has no coordinates, so this carries no location.
   */
  gps?: boolean
}

/**
 * Writes a single-lap FIT activity with one record per second. Missing (NaN) fields are omitted,
 * and seconds inside a pause are left out so the pause survives the round trip.
 */
export function encodeFit(activity: Activity, opts: EncodeOptions = {}): Uint8Array {
  const encoder = new Encoder()
  const { n } = activity
  const startSec = Math.floor(activity.startMs / 1000)
  const endSec = startSec + Math.max(0, n - 1)
  const startTime = new Date(startSec * 1000)
  const endTime = new Date(endSec * 1000)
  const sport = activity.sport === 'run' ? 'running' : 'cycling'
  const totalDistance = n > 0 ? (sample(activity.distance, n - 1) ?? 0) : 0

  const fileId: FileIdMesg = {
    type: 'activity',
    manufacturer: 'development',
    product: 0,
    timeCreated: startTime,
  }
  encoder.onMesg(MESG_FILE_ID, fileId)

  for (let i = 0; i < n; i++) {
    if (activity.paused[i] === 1) continue
    const record: RecordMesg = { timestamp: new Date((startSec + i) * 1000) }
    if (opts.gps) {
      record.positionLat = 0
      record.positionLong = 0
    }
    const distance = sample(activity.distance, i)
    if (distance !== undefined) record.distance = distance
    const speed = sample(activity.speed, i)
    if (speed !== undefined) record.enhancedSpeed = speed
    const altitude = sample(activity.altitude, i)
    if (altitude !== undefined) record.enhancedAltitude = altitude
    const heartRate = sample(activity.heartRate, i)
    if (heartRate !== undefined) record.heartRate = Math.round(heartRate)
    const power = sample(activity.power, i)
    if (power !== undefined) record.power = Math.round(power)
    encoder.onMesg(MESG_RECORD, record)
  }

  const lap: LapMesg = {
    messageIndex: 0,
    event: 'lap',
    eventType: 'stop',
    startTime,
    timestamp: endTime,
    totalElapsedTime: n,
    totalTimerTime: n,
    totalDistance,
  }
  encoder.onMesg(MESG_LAP, lap)

  const session: SessionMesg = {
    messageIndex: 0,
    event: 'session',
    eventType: 'stop',
    startTime,
    timestamp: endTime,
    sport,
    subSport: opts.subSport,
    totalElapsedTime: n,
    totalTimerTime: n,
    totalDistance,
    firstLapIndex: 0,
    numLaps: 1,
  }
  encoder.onMesg(MESG_SESSION, session)

  const summary: ActivityMesg = {
    timestamp: endTime,
    type: 'manual',
    event: 'activity',
    eventType: 'stop',
    numSessions: 1,
    totalTimerTime: n,
  }
  encoder.onMesg(MESG_ACTIVITY, summary)

  return encoder.close()
}

function sample(xs: Float64Array, i: number): number | undefined {
  const value = xs[i]
  return value !== undefined && Number.isFinite(value) ? value : undefined
}
