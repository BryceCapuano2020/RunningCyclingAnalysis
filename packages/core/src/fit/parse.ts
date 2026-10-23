import type { Activity, Sport } from '../types'
import { activitiesFromUnits, MAX_FILE_SAMPLES } from '../import/pipeline'
import type { PipelineUnit } from '../import/pipeline'
import { decodeFit } from './protocol/decode'
import type { DecodedEvent, DecodedRecord, DecodedSession } from './protocol/decode'
import type { FitSportName, FitSubSportName } from './protocol/profile'
import { isFitFile, TRUNCATED_ERROR } from './protocol/reader'
import type { RawRecord, RawTimerEvent } from './resample'

export type ParseResult =
  | { ok: true; activities: Activity[]; skipped: string[]; droppedValues: number }
  | { ok: false; fileName: string; reason: string }

export interface ParseLimits {
  maxFileBytes: number
  maxRecordMessages: number
  /** The longest single activity, in seconds. */
  maxActivitySeconds: number
}

export interface ParseOptions {
  /** The clock for the date check, in epoch milliseconds. Defaults to Date.now(). */
  nowMs?: number
}

export const DEFAULT_PARSE_LIMITS: Readonly<ParseLimits> = {
  maxFileBytes: 64 * 1024 ** 2,
  maxRecordMessages: 2_000_000,
  maxActivitySeconds: MAX_FILE_SAMPLES,
}

const NOT_FIT = 'Not a FIT file'
const DECODE_FAILED = 'Could not decode FIT file'
const CORRUPT = 'File is corrupt (checksum mismatch)'
const INCOMPLETE = 'File is incomplete or corrupt'
const NO_RECORDS = 'File contains no activity records'
const OVERLAP = 'Sessions overlap; times were adjusted'
const E_BIKE_REASON =
  'E-bike activities are not supported because motor assistance hides your own power'

const INDOOR_SUB_SPORTS = new Set<string>([
  'treadmill',
  'indoorRunning',
  'indoorCycling',
  'spin',
  'virtualActivity',
])
const E_BIKE_SUB_SPORTS = new Set<string>(['eBikeFitness', 'eBikeMountain', 'eBikeEnduro'])

/** A decoded record with its epoch time. */
interface Timed {
  tMs: number
  record: DecodedRecord
}

/** The records and timer events that belong to one session, or to the whole file without sessions. */
interface Unit {
  session: DecodedSession | undefined
  /** Sorted by time. */
  records: Timed[]
  events: RawTimerEvent[]
}

type DecodedSportMessage = {
  sport: FitSportName | undefined
  subSport: FitSubSportName | undefined
}

type SportMapping =
  { ok: true; sport: Sport; indoor: boolean } | { ok: false; reason: string; skipped: string }

/** Decodes every session of a FIT file into 1 Hz Activities. Never throws. */
export function parseFit(
  bytes: Uint8Array,
  fileName: string,
  limits: ParseLimits = DEFAULT_PARSE_LIMITS,
  opts: ParseOptions = {},
): ParseResult {
  try {
    return parseUnchecked(bytes, fileName, limits, opts)
  } catch {
    return failure(fileName, DECODE_FAILED)
  }
}

function parseUnchecked(
  bytes: Uint8Array,
  fileName: string,
  limits: ParseLimits,
  opts: ParseOptions,
): ParseResult {
  if (bytes.length > limits.maxFileBytes) {
    return failure(fileName, `FIT file exceeds the ${limits.maxFileBytes}-byte limit`)
  }
  if (!isFitFile(bytes)) return failure(fileName, NOT_FIT)

  const decoded = decodeFit(bytes, { maxRecords: limits.maxRecordMessages })
  if (decoded.recordCount > limits.maxRecordMessages) {
    return failure(fileName, `FIT file exceeds the ${limits.maxRecordMessages}-record limit`)
  }
  // Partial data is never used: a damaged file could place records at the wrong times.
  if (!decoded.ok) {
    return failure(fileName, decoded.errors.includes(TRUNCATED_ERROR) ? INCOMPLETE : CORRUPT)
  }
  const { messages } = decoded
  if (messages.records.length === 0) return failure(fileName, NO_RECORDS)

  const skipped: string[] = []
  const units = assignUnits(
    messages.sessions,
    timedRecords(messages.records),
    messages.events,
    skipped,
  )
  const sportMesg = messages.sports[0]
  const result = activitiesFromUnits(
    { fileName, units: units.map((unit) => toPipelineUnit(unit, sportMesg)) },
    limits,
    opts,
  )
  if (!result.ok) return result
  return { ...result, skipped: [...skipped, ...result.skipped] }
}

/** Maps one session's FIT records and sport to the shared pipeline's input. */
function toPipelineUnit(unit: Unit, sportMesg: DecodedSportMessage | undefined): PipelineUnit {
  const { sport, subSport } = resolveSport(unit.session, sportMesg)
  const mapping = mapSport(sport, subSport)
  const shared = {
    records: unit.records.map((t) => toRaw(t)),
    timerEvents: unit.events,
    sportLabel: sport ?? 'unknown',
    hasPosition: unit.records.some((t) => t.record.positionLat !== undefined),
  }
  if (!mapping.ok) {
    const refusal = { reason: mapping.reason, skipped: mapping.skipped }
    return { ...shared, sport: null, refusal, indoor: false }
  }
  return { ...shared, sport: mapping.sport, indoor: mapping.indoor }
}

function mapSport(
  sport: FitSportName | undefined,
  subSport: FitSubSportName | undefined,
): SportMapping {
  if (inSet(E_BIKE_SUB_SPORTS, subSport) || sport === 'eBiking') {
    return { ok: false, reason: E_BIKE_REASON, skipped: 'e-bike session skipped' }
  }
  const indoor = inSet(INDOOR_SUB_SPORTS, subSport) || sport === 'fitnessEquipment'
  if (sport === 'running') return { ok: true, sport: 'run', indoor }
  if (sport === 'cycling') return { ok: true, sport: 'ride', indoor }
  if (sport === 'fitnessEquipment') {
    if (subSport === 'indoorCycling' || subSport === 'spin') {
      return { ok: true, sport: 'ride', indoor }
    }
    if (subSport === 'treadmill' || subSport === 'indoorRunning') {
      return { ok: true, sport: 'run', indoor }
    }
  }
  const label = sport ?? 'unknown'
  return {
    ok: false,
    reason: `Unsupported sport: ${label}`,
    skipped: `${label} session skipped`,
  }
}

/** Uses the session's sport unless it is missing or generic, then the file's sport message. */
function resolveSport(
  session: DecodedSession | undefined,
  sportMesg: DecodedSportMessage | undefined,
): DecodedSportMessage {
  const sessionSport = session?.sport
  if (sessionSport !== undefined && sessionSport !== 'generic') {
    return { sport: sessionSport, subSport: session?.subSport }
  }
  if (sportMesg?.sport !== undefined && sportMesg.sport !== 'generic') {
    return { sport: sportMesg.sport, subSport: sportMesg.subSport }
  }
  return { sport: sessionSport, subSport: session?.subSport }
}

/** Records that carry a timestamp, sorted by time. */
function timedRecords(records: DecodedRecord[]): Timed[] {
  const out: Timed[] = []
  for (const record of records) {
    if (record.timestampMs !== undefined) out.push({ tMs: record.timestampMs, record })
  }
  return out.sort((a, b) => a.tMs - b.tMs)
}

/** A decoded FIT record as a RawRecord. Impossible values are dropped later, by the pipeline. */
function toRaw(t: Timed): RawRecord {
  const r = t.record
  return {
    tMs: t.tMs,
    distance: r.distance,
    speed: r.enhancedSpeed ?? r.speed,
    altitude: r.enhancedAltitude ?? r.altitude,
    heartRate: r.heartRate,
    power: r.power,
  }
}

/**
 * Splits the file into units. With several sessions each record and timer event goes to exactly
 * one session: the latest-starting window that contains it. Overlapping windows are reported.
 */
function assignUnits(
  sessions: DecodedSession[],
  timed: Timed[],
  events: DecodedEvent[],
  skipped: string[],
): Unit[] {
  const timerEvents = timerEventsOf(events)
  if (sessions.length === 0) return [{ session: undefined, records: timed, events: timerEvents }]

  const units: Unit[] = sessions.map((session) => ({ session, records: [], events: [] }))
  const windows = sessionWindows(sessions)
  if (overlaps(windows)) skipped.push(OVERLAP)
  if (sessions.length === 1) {
    units[0]!.records = timed
  } else {
    const owners = ownersOf(
      windows,
      timed.map((t) => t.tMs),
    )
    timed.forEach((t, k) => {
      const owner = owners[k]!
      if (owner >= 0) units[owner]!.records.push(t)
    })
  }
  const eventOwners = ownersOf(
    windows,
    timerEvents.map((e) => e.tMs),
  )
  timerEvents.forEach((event, k) => {
    const owner = eventOwners[k]!
    if (owner >= 0) units[owner]!.events.push(event)
  })
  return units
}

function timerEventsOf(events: DecodedEvent[]): RawTimerEvent[] {
  const out: RawTimerEvent[] = []
  for (const event of events) {
    if (
      event.event === 'timer' &&
      event.timestampMs !== undefined &&
      event.eventType !== undefined
    ) {
      out.push({ tMs: event.timestampMs, eventType: event.eventType })
    }
  }
  return out.sort((a, b) => a.tMs - b.tMs)
}

/** A session's window: [start, start + elapsed]. Sessions without a start have none. */
interface Window {
  index: number
  start: number
  end: number
}

/** Session windows sorted by start. */
function sessionWindows(sessions: DecodedSession[]): Window[] {
  const windows: Window[] = []
  sessions.forEach((session, index) => {
    const start = session.startTimeMs
    if (start === undefined) return
    windows.push({ index, start, end: start + (session.totalElapsedTime ?? 0) * 1000 })
  })
  return windows.sort((a, b) => a.start - b.start)
}

/**
 * Sorted windows overlap exactly when some window starts before its predecessor ends, so checking
 * neighbours is enough.
 */
function overlaps(windows: Window[]): boolean {
  return windows.some((window, k) => k > 0 && window.start < windows[k - 1]!.end)
}

/**
 * For each time, the session index of the latest-starting window that contains it, or -1. Times
 * are visited in order while the windows open and close, so the cost is O(n log n + windows).
 */
function ownersOf(windows: Window[], times: number[]): number[] {
  const owners = new Array<number>(times.length).fill(-1)
  const order = times.map((_, i) => i).sort((a, b) => times[a]! - times[b]!)
  // Windows opened so far, in start order. The top is the latest start among those still open.
  const open: Window[] = []
  let next = 0
  for (const i of order) {
    const t = times[i]!
    while (next < windows.length && windows[next]!.start <= t) open.push(windows[next++]!)
    while (open.length > 0 && open[open.length - 1]!.end < t) open.pop()
    const top = open[open.length - 1]
    if (top !== undefined) owners[i] = top.index
  }
  return owners
}

function inSet(set: Set<string>, value: unknown): boolean {
  return typeof value === 'string' && set.has(value)
}

function failure(fileName: string, reason: string): ParseResult {
  return { ok: false, fileName, reason }
}
