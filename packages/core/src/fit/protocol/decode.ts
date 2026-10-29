import { MAX_FILE_SAMPLES } from '../../constants'
import { scanFit } from './reader'
import type { FitMessage } from './reader'
import { FIELD, MESG, eventTypeName, fitTimeToEpochMs, sportName, subSportName } from './profile'
import type { FitEventType, FitSportName, FitSubSportName } from './profile'

/** The records one file may hold: the seconds of the longest activity the grid takes, one record a second. */
export const DEFAULT_MAX_RECORDS = MAX_FILE_SAMPLES

/**
 * The data messages of every kind one file may hold. A real file has records plus a few other messages a
 * record (heart-rate variability, device information, events); this leaves room for several of each and
 * stops a file of nothing but small messages from costing time and memory in proportion to its size.
 */
export const DEFAULT_MAX_MESSAGES = 500_000

export interface DecodedFileId {
  /** The FILE_TYPE enum value, for example 4 for an activity. */
  type: number | undefined
}

export interface DecodedSport {
  sport: FitSportName | undefined
  subSport: FitSubSportName | undefined
}

export interface DecodedSession {
  timestampMs: number | undefined
  startTimeMs: number | undefined
  /** Seconds, pauses included. */
  totalElapsedTime: number | undefined
  /** Seconds, pauses excluded. */
  totalTimerTime: number | undefined
  /** Metres, as the device summarised it. */
  totalDistance: number | undefined
  /** Beats per minute, as the device averaged it over the timer time. */
  avgHeartRate: number | undefined
  /** Watts, as the device averaged it over the timer time, zeros included. */
  avgPower: number | undefined
  sport: FitSportName | undefined
  subSport: FitSubSportName | undefined
}

export interface DecodedRecord {
  /** Epoch milliseconds. Undefined for a system time (below 2^28 seconds), which has no date. */
  timestampMs: number | undefined
  /** The timestamp as written: FIT seconds, system times included. */
  timestampS: number | undefined
  /** Semicircles, as written in the file. */
  positionLat: number | undefined
  positionLong: number | undefined
  /** Metres. */
  altitude: number | undefined
  heartRate: number | undefined
  cadence: number | undefined
  fractionalCadence: number | undefined
  temperature: number | undefined
  /** Metres. Taken from the compressed distance field when the record has no distance field. */
  distance: number | undefined
  /** Metres per second. Taken from the compressed speed field when the record has no speed field. */
  speed: number | undefined
  power: number | undefined
  /** Metres per second. */
  enhancedSpeed: number | undefined
  /** Metres. */
  enhancedAltitude: number | undefined
}

export interface DecodedLap {
  startTimeMs: number | undefined
  timestampMs: number | undefined
  totalElapsedTime: number | undefined
  totalTimerTime: number | undefined
}

export interface DecodedEvent {
  timestampMs: number | undefined
  event: 'timer' | undefined
  eventType: FitEventType | undefined
}

export interface DecodedMessages {
  fileId?: DecodedFileId
  sports: DecodedSport[]
  sessions: DecodedSession[]
  laps: DecodedLap[]
  records: DecodedRecord[]
  events: DecodedEvent[]
}

export interface DecodeOptions {
  /** Decoding stops with an error once more record messages than this have been seen. */
  maxRecords?: number
  /** Decoding stops with an error once more data messages of any kind than this have been seen. */
  maxMessages?: number
}

export interface DecodeResult {
  /** True when the file decoded without errors and its CRC matches. */
  ok: boolean
  messages: DecodedMessages
  errors: string[]
  warnings: string[]
  crcValid: boolean
  /** Record messages seen, including any beyond the limit that stopped decoding. */
  recordCount: number
  /** Data messages of every kind seen, including any beyond the limit that stopped decoding. */
  messageCount: number
}

type Values = Map<number, number | string>

/**
 * Decodes the first FIT file in `bytes` into the messages the analysis uses. Never throws; every
 * read is bounds-checked. Values outside the profile's valid range are undefined.
 */
export function decodeFit(bytes: Uint8Array, opts: DecodeOptions = {}): DecodeResult {
  const maxRecords = opts.maxRecords ?? DEFAULT_MAX_RECORDS
  const maxMessages = opts.maxMessages ?? DEFAULT_MAX_MESSAGES
  const messages: DecodedMessages = { sports: [], sessions: [], laps: [], records: [], events: [] }
  const errors: string[] = []
  const compressed = compressedReader()
  let recordCount = 0
  let messageCount = 0
  let warnings: string[] = []
  let crcValid = false
  try {
    const scan = scanFit(bytes, (message) => {
      messageCount++
      if (messageCount > maxMessages) return false
      if (message.globalNum === MESG.record) {
        recordCount++
        if (recordCount > maxRecords) return false
        const raw = message.arrays?.get(FIELD.compressedSpeedDistance)
        // Each record with the field advances the distance counter, as the FIT SDK does.
        const reading = raw === undefined ? undefined : compressed(raw)
        messages.records.push(toRecord(message.values, reading))
      } else {
        collect(messages, message)
      }
      return true
    })
    errors.push(...scan.errors)
    warnings = scan.warnings
    crcValid = scan.crcValid
    if (recordCount > maxRecords) errors.push(`Record count exceeds the ${maxRecords}-record limit`)
    else if (messageCount > maxMessages) {
      errors.push(`Message count exceeds the ${maxMessages}-message limit`)
    }
  } catch {
    errors.push('Could not decode FIT data')
  }
  return {
    ok: errors.length === 0,
    messages,
    errors,
    warnings,
    crcValid,
    recordCount,
    messageCount,
  }
}

function collect(messages: DecodedMessages, message: FitMessage): void {
  const v = message.values
  switch (message.globalNum) {
    case MESG.fileId:
      messages.fileId ??= { type: numberOf(v, 0) }
      return
    case MESG.sport:
      messages.sports.push({
        sport: sportName(numberOf(v, 0) ?? -1),
        subSport: subSportName(numberOf(v, 1) ?? -1),
      })
      return
    case MESG.session:
      messages.sessions.push({
        timestampMs: fitTimeToEpochMs(numberOf(v, FIELD.timestamp)),
        startTimeMs: fitTimeToEpochMs(numberOf(v, 2)),
        totalElapsedTime: scaled(v, 7, 1000),
        totalTimerTime: scaled(v, 8, 1000),
        totalDistance: scaled(v, 9, 100),
        avgHeartRate: numberOf(v, 16),
        avgPower: numberOf(v, 20),
        sport: sportName(numberOf(v, 5) ?? -1),
        subSport: subSportName(numberOf(v, 6) ?? -1),
      })
      return
    case MESG.lap:
      messages.laps.push({
        timestampMs: fitTimeToEpochMs(numberOf(v, FIELD.timestamp)),
        startTimeMs: fitTimeToEpochMs(numberOf(v, 2)),
        totalElapsedTime: scaled(v, 7, 1000),
        totalTimerTime: scaled(v, 8, 1000),
      })
      return
    case MESG.event:
      messages.events.push({
        timestampMs: fitTimeToEpochMs(numberOf(v, FIELD.timestamp)),
        event: numberOf(v, 0) === 0 ? 'timer' : undefined,
        eventType: eventTypeName(numberOf(v, 1) ?? -1),
      })
      return
    default:
      return
  }
}

function toRecord(v: Values, compressed: CompressedReading | undefined): DecodedRecord {
  const timestampS = numberOf(v, FIELD.timestamp)
  return {
    timestampMs: fitTimeToEpochMs(timestampS),
    timestampS,
    positionLat: numberOf(v, FIELD.positionLat),
    positionLong: numberOf(v, FIELD.positionLong),
    altitude: scaled(v, FIELD.altitude, 5, 500),
    heartRate: numberOf(v, FIELD.heartRate),
    cadence: numberOf(v, FIELD.cadence),
    fractionalCadence: scaled(v, FIELD.fractionalCadence, 128),
    temperature: numberOf(v, FIELD.temperature),
    distance: scaled(v, FIELD.distance, 100) ?? compressed?.distance,
    speed: scaled(v, FIELD.speed, 1000) ?? compressed?.speed,
    power: numberOf(v, FIELD.power),
    enhancedSpeed: scaled(v, FIELD.enhancedSpeed, 1000),
    enhancedAltitude: scaled(v, FIELD.enhancedAltitude, 5, 500),
  }
}

/** Speed (m/s) and cumulative distance (m) from one compressed speed and distance field. */
interface CompressedReading {
  speed: number
  distance: number
}

/**
 * Reads Garmin's compressed speed and distance: three bytes, least significant bit first, holding
 * a 12-bit speed in 1/100 m/s and a 12-bit distance counter in 1/16 m that wraps at 4096. As in the
 * FIT SDK, the distance is rebuilt by adding each step modulo 4096, starting at the first counter.
 * The returned reader keeps that state across the records of one file.
 */
function compressedReader(): (bytes: Uint8Array) => CompressedReading | undefined {
  let lastCounter: number | undefined
  let distanceCounter = 0
  return (bytes) => {
    if (bytes.length < 3) return undefined
    const bits = (bytes[0] ?? 0) | ((bytes[1] ?? 0) << 8) | ((bytes[2] ?? 0) << 16)
    const speed = (bits & 0xfff) / 100
    const counter = (bits >>> 12) & 0xfff
    distanceCounter =
      lastCounter === undefined ? counter : distanceCounter + ((counter - lastCounter) & 0xfff)
    lastCounter = counter
    return { speed, distance: distanceCounter / 16 }
  }
}

function numberOf(v: Values, field: number): number | undefined {
  const value = v.get(field)
  return typeof value === 'number' ? value : undefined
}

/** A raw value divided by `scale`, less `offset` (the profile's scale and offset). */
function scaled(v: Values, field: number, scale: number, offset = 0): number | undefined {
  const raw = numberOf(v, field)
  return raw === undefined ? undefined : raw / scale - offset
}
