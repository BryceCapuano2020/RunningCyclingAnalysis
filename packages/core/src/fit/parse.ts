import type { Activity, Sport } from '../types'
import { decodeFit } from './protocol/decode'
import type { DecodedEvent, DecodedRecord, DecodedSession } from './protocol/decode'
import type { FitSportName, FitSubSportName } from './protocol/profile'
import { isFitFile, TRUNCATED_ERROR } from './protocol/reader'
import { resample, splitAtGaps } from './resample'
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

/** 48 hours at 1 Hz: the most grid samples one file may produce, summed over its sessions. */
const MAX_FILE_SAMPLES = 172_800
const DAY_MS = 24 * 60 * 60 * 1000
const EARLIEST_ACTIVITY_MS = Date.UTC(2000, 0, 1)
const MAX_FUTURE_MS = DAY_MS
const MIN_RECORDS = 60
const MAX_SPEED_MPS: Record<Sport, number> = { ride: 30, run: 12.5 }
const MAX_POWER_W = 3000
const MIN_HEART_RATE = 25
const MAX_HEART_RATE = 250

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
const SHORT_REASON = 'Activity is shorter than one minute'
const TOO_LONG = 'Activity is longer than 48 hours'
const TOO_MUCH = 'File contains too much data'
const DATE_REASON = 'Activity date is not plausible'
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

type Outcome =
  | { ok: true; activity: Activity; dropped: number }
  | { ok: false; reason: string; skipped: string; fatal: boolean }

interface Context {
  fileName: string
  multi: boolean
  sportMesg: DecodedSportMessage | undefined
  limits: ParseLimits
  nowMs: number
  /** Grid samples already allocated for this file. */
  usedSamples: number
}

type DecodedSportMessage = {
  sport: FitSportName | undefined
  subSport: FitSubSportName | undefined
}

/** Decodes every session of a FIT file into 1 Hz Activities. Never throws. */
export function parseFit(
  bytes: Uint8Array,
  fileName: string,
  limits: ParseLimits = DEFAULT_PARSE_LIMITS,
  opts: ParseOptions = {},
): ParseResult {
  try {
    return parseUnchecked(bytes, fileName, limits, opts.nowMs ?? Date.now())
  } catch {
    return failure(fileName, DECODE_FAILED)
  }
}

function parseUnchecked(
  bytes: Uint8Array,
  fileName: string,
  limits: ParseLimits,
  nowMs: number,
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

  const sessions = messages.sessions
  const skipped: string[] = []
  const units = assignUnits(sessions, timedRecords(messages.records), messages.events, skipped)
  const context: Context = {
    fileName,
    multi: sessions.length > 1,
    sportMesg: messages.sports[0],
    limits,
    nowMs,
    usedSamples: 0,
  }

  const outcomes: Outcome[] = []
  for (const [index, unit] of units.entries()) {
    for (const outcome of evaluateUnit(unit, index, context)) {
      outcomes.push(outcome)
      if (!outcome.ok && outcome.fatal) return failure(fileName, outcome.reason)
    }
  }

  const activities: Activity[] = []
  let droppedValues = 0
  for (const outcome of outcomes) {
    if (outcome.ok) {
      activities.push(outcome.activity)
      droppedValues += outcome.dropped
    } else {
      skipped.push(outcome.skipped)
    }
  }
  if (activities.length === 0) return failure(fileName, pickReason(outcomes))
  return { ok: true, activities, skipped, droppedValues }
}

/**
 * One outcome per continuous part of a session: a gap of more than four hours between records
 * (see splitAtGaps) ends one activity and starts the next. Stops at the first fatal outcome, so
 * nothing after a refused file is allocated.
 */
function evaluateUnit(unit: Unit, index: number, context: Context): Outcome[] {
  const { sport, subSport } = resolveSport(unit.session, context.sportMesg)
  const mapping = mapSport(sport, subSport)
  if (!mapping.ok) {
    return [{ ok: false, reason: mapping.reason, skipped: mapping.skipped, fatal: false }]
  }
  const maxSpeed = MAX_SPEED_MPS[mapping.sport]
  const drops = new Map<RawRecord, number>()
  const segments = splitAtGaps(unit.records.map((t) => toRaw(t, maxSpeed, drops)))

  // A trainer ride saved as plain cycling has neither a position nor altitude, so it is indoor too.
  const hasPosition = unit.records.some((t) => t.record.positionLat !== undefined)
  const hasAltitude = unit.records.some(
    (t) => t.record.enhancedAltitude !== undefined || t.record.altitude !== undefined,
  )
  const outcomes: Outcome[] = []
  for (const [part, segment] of segments.entries()) {
    const outcome = evaluateSegment(segment, {
      unit,
      index,
      part,
      parts: segments.length,
      sport: mapping.sport,
      indoor: mapping.indoor || (!hasPosition && !hasAltitude),
      drops,
      maxSpeed,
      context,
    })
    outcomes.push(outcome)
    if (!outcome.ok && outcome.fatal) break
  }
  return outcomes
}

interface SegmentInfo {
  unit: Unit
  index: number
  part: number
  parts: number
  sport: Sport
  indoor: boolean
  drops: Map<RawRecord, number>
  maxSpeed: number
  context: Context
}

/** Resamples one continuous part of a session into an Activity, or says why it is not one. */
function evaluateSegment(segment: RawRecord[], info: SegmentInfo): Outcome {
  const { unit, index, part, parts, sport, indoor, drops, maxSpeed, context } = info
  const { fileName, multi, limits, nowMs } = context
  const short: Outcome = {
    ok: false,
    reason: SHORT_REASON,
    skipped: 'session shorter than one minute',
    fatal: false,
  }
  if (segment.length < MIN_RECORDS) return short

  // The grid length is known before anything is allocated, so a long file is refused up front.
  const first = segment[0]!.tMs
  const last = segment[segment.length - 1]!.tMs
  const samples = Math.round((last - first) / 1000) + 1
  if (samples > MAX_FILE_SAMPLES) {
    return { ok: false, reason: TOO_LONG, skipped: 'activity longer than 48 hours', fatal: true }
  }
  if (context.usedSamples + samples > MAX_FILE_SAMPLES) {
    return { ok: false, reason: TOO_MUCH, skipped: 'file contains too much data', fatal: true }
  }
  context.usedSamples += samples

  const events = unit.events.filter((e) => e.tMs >= first && e.tMs <= last)
  let resampled: ReturnType<typeof resample>
  try {
    resampled = resample(segment, events, limits.maxActivitySeconds)
  } catch (error) {
    if (error instanceof RangeError) {
      return {
        ok: false,
        reason: error.message,
        skipped: 'activity exceeds the supported time range',
        fatal: false,
      }
    }
    throw error
  }
  if (resampled.n < MIN_RECORDS) return short
  if (resampled.startMs < EARLIEST_ACTIVITY_MS || resampled.startMs > nowMs + MAX_FUTURE_MS) {
    return {
      ok: false,
      reason: DATE_REASON,
      skipped: 'activity date is not plausible',
      fatal: false,
    }
  }
  // A speed derived from distance can still exceed the sport's limit; such samples are missing.
  const derivedDropped = clampSpeed(resampled.speed, maxSpeed)
  const dropped = segment.reduce((sum, r) => sum + (drops.get(r) ?? 0), 0) + derivedDropped

  const base = baseName(fileName)
  const idBase = `${resampled.startMs}-${fileName}`
  const id = multi ? `${idBase}#${index}` : idBase
  const name = multi ? `${base} (${sport})` : base
  const activity: Activity = {
    id: parts > 1 ? `${id}.${part + 1}` : id,
    name: parts > 1 ? `${name} (part ${part + 1})` : name,
    sport,
    indoor,
    ...resampled,
  }
  return { ok: true, activity, dropped }
}

type SportMapping =
  { ok: true; sport: Sport; indoor: boolean } | { ok: false; reason: string; skipped: string }

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

/** Converts a record for resampling. Impossible values are dropped and counted per record. */
function toRaw(t: Timed, maxSpeed: number, drops: Map<RawRecord, number>): RawRecord {
  const r = t.record
  const counts = { dropped: 0 }
  const raw: RawRecord = {
    tMs: t.tMs,
    distance: r.distance,
    speed: keepWithin(r.enhancedSpeed ?? r.speed, 0, maxSpeed, counts),
    altitude: r.enhancedAltitude ?? r.altitude,
    heartRate: keepWithin(r.heartRate, MIN_HEART_RATE, MAX_HEART_RATE, counts),
    power: keepWithin(r.power, 0, MAX_POWER_W, counts),
  }
  if (counts.dropped > 0) drops.set(raw, counts.dropped)
  return raw
}

/** A value outside [min, max] is impossible: it is dropped and counted. */
function keepWithin(
  value: number | undefined,
  min: number,
  max: number,
  counts: { dropped: number },
): number | undefined {
  if (value === undefined || (value >= min && value <= max)) return value
  counts.dropped++
  return undefined
}

/** Marks speeds above the limit as missing. Returns how many were marked. */
function clampSpeed(speed: Float64Array, max: number): number {
  let marked = 0
  for (let i = 0; i < speed.length; i++) {
    if (speed[i]! > max) {
      speed[i] = NaN
      marked++
    }
  }
  return marked
}

/** Prefers a specific reason over the generic short-activity one. */
function pickReason(outcomes: Outcome[]): string {
  const reasons = outcomes.flatMap((o) => (o.ok ? [] : [o.reason]))
  return reasons.find((reason) => reason !== SHORT_REASON) ?? reasons[0] ?? SHORT_REASON
}

function inSet(set: Set<string>, value: unknown): boolean {
  return typeof value === 'string' && set.has(value)
}

function baseName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName
  return base.replace(/\.fit(\.gz)?$/i, '')
}

function failure(fileName: string, reason: string): ParseResult {
  return { ok: false, fileName, reason }
}
