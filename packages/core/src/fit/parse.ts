import { Decoder, Stream } from '@garmin/fitsdk'
import type { EventMesg, RecordMesg, SessionMesg, SportMesg, Types } from '@garmin/fitsdk'
import type { Activity, Sport } from '../types'
import { MAX_ACTIVITY_GRID_SECONDS, resample } from './resample'
import type { RawRecord, RawTimerEvent } from './resample'

export type ParseResult =
  | { ok: true; activities: Activity[]; skipped: string[] }
  | { ok: false; fileName: string; reason: string }

export interface ParseLimits {
  maxFileBytes: number
  maxRecordMessages: number
  maxActivitySeconds: number
}

export const DEFAULT_PARSE_LIMITS: Readonly<ParseLimits> = {
  maxFileBytes: 64 * 1024 ** 2,
  maxRecordMessages: 2_000_000,
  maxActivitySeconds: MAX_ACTIVITY_GRID_SECONDS,
}

/** A FIT header is 12 bytes at minimum; the signature sits at bytes 8 to 11. */
const MIN_HEADER_BYTES = 12
const MIN_SAMPLES = 60
const SHORT_REASON = 'Activity is shorter than one minute'
const E_BIKE_REASON =
  'E-bike activities are not supported because motor assistance hides your own power'

const INDOOR_SUB_SPORTS = new Set([
  'treadmill',
  'indoorRunning',
  'indoorCycling',
  'spin',
  'virtualActivity',
])
const E_BIKE_SUB_SPORTS = new Set(['eBikeFitness', 'eBikeMountain'])

interface Timed {
  tMs: number
  mesg: RecordMesg
}

/** Records that belong to one session, with the session they were written under. */
interface Unit {
  session: SessionMesg | undefined
  records: Timed[]
}

type Outcome = { ok: true; activity: Activity } | { ok: false; reason: string; skipped: string }

/** Decodes every session of a FIT file into 1 Hz Activities. Never throws. */
export function parseFit(
  bytes: Uint8Array,
  fileName: string,
  limits: ParseLimits = DEFAULT_PARSE_LIMITS,
): ParseResult {
  try {
    return parseUnchecked(bytes, fileName, limits)
  } catch {
    return failure(fileName, 'Could not decode FIT file')
  }
}

function parseUnchecked(bytes: Uint8Array, fileName: string, limits: ParseLimits): ParseResult {
  if (bytes.length > limits.maxFileBytes) {
    return failure(fileName, `FIT file exceeds the ${limits.maxFileBytes}-byte limit`)
  }
  if (bytes.length < MIN_HEADER_BYTES) return failure(fileName, 'Not a FIT file')
  const decoder = new Decoder(Stream.fromByteArray(bytes))
  if (!decoder.isFIT()) return failure(fileName, 'Not a FIT file')

  const { messages, errors } = decoder.read()
  if ((messages.recordMesgs?.length ?? 0) > limits.maxRecordMessages) {
    return failure(fileName, `FIT file exceeds the ${limits.maxRecordMessages}-record limit`)
  }
  const timed = timedRecords(messages.recordMesgs ?? [])
  if (errors.length > 0 && timed.length < MIN_SAMPLES) {
    return failure(fileName, 'Could not decode FIT file')
  }

  const sessions = messages.sessionMesgs ?? []
  const timerEvents = timerMessages(messages.eventMesgs ?? [])
  const sportMesg = messages.sportMesgs?.[0]
  const multi = sessions.length > 1
  const units: Unit[] = multi
    ? assignToSessions(sessions, timed)
    : [{ session: sessions[0], records: timed }]

  const outcomes = units.map((unit, index) =>
    evaluate(unit, index, sportMesg, multi, fileName, timerEvents, limits),
  )
  const activities: Activity[] = []
  const skipped: string[] = []
  for (const outcome of outcomes) {
    if (outcome.ok) activities.push(outcome.activity)
    else skipped.push(outcome.skipped)
  }
  if (activities.length === 0) return failure(fileName, pickReason(outcomes))
  return { ok: true, activities, skipped }
}

function evaluate(
  unit: Unit,
  index: number,
  sportMesg: SportMesg | undefined,
  multi: boolean,
  fileName: string,
  timerEvents: RawTimerEvent[],
  limits: ParseLimits,
): Outcome {
  const { sport, subSport } = resolveSport(unit.session, sportMesg)
  const mapping = mapSport(sport, subSport)
  if (!mapping.ok) return { ok: false, reason: mapping.reason, skipped: mapping.skipped }

  const events = unit.session
    ? timerEvents.filter((event) => inWindow(unit.session, event.tMs))
    : timerEvents
  let resampled: ReturnType<typeof resample>
  try {
    resampled = resample(unit.records.map(toRaw), events, limits.maxActivitySeconds)
  } catch (error) {
    if (error instanceof RangeError) {
      return {
        ok: false,
        reason: error.message,
        skipped: 'activity exceeds the supported time range',
      }
    }
    throw error
  }
  if (resampled.n < MIN_SAMPLES) {
    return { ok: false, reason: SHORT_REASON, skipped: 'session shorter than one minute' }
  }

  // A trainer ride saved as plain cycling has neither a position nor altitude, so it is indoor too.
  const hasPosition = unit.records.some((t) => t.mesg.positionLat !== undefined)
  const hasAltitude = unit.records.some(
    (t) => t.mesg.enhancedAltitude !== undefined || t.mesg.altitude !== undefined,
  )
  const base = baseName(fileName)
  const activity: Activity = {
    id: multi ? `${resampled.startMs}-${fileName}#${index}` : `${resampled.startMs}-${fileName}`,
    name: multi ? `${base} (${mapping.sport})` : base,
    sport: mapping.sport,
    indoor: mapping.indoor || (!hasPosition && !hasAltitude),
    ...resampled,
  }
  return { ok: true, activity }
}

type SportMapping =
  { ok: true; sport: Sport; indoor: boolean } | { ok: false; reason: string; skipped: string }

function mapSport(
  sport: Types.Sport | undefined,
  subSport: Types.SubSport | undefined,
): SportMapping {
  if (inSet(E_BIKE_SUB_SPORTS, subSport) || sport === 'eBiking') {
    return { ok: false, reason: E_BIKE_REASON, skipped: 'e-bike session skipped' }
  }
  const indoor = inSet(INDOOR_SUB_SPORTS, subSport) || sport === 'fitnessEquipment'
  if (sport === 'running') return { ok: true, sport: 'run', indoor }
  if (sport === 'cycling') return { ok: true, sport: 'ride', indoor }
  if (sport === 'fitnessEquipment') {
    if (subSport === 'indoorCycling' || subSport === 'spin')
      return { ok: true, sport: 'ride', indoor }
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
  session: SessionMesg | undefined,
  sportMesg: SportMesg | undefined,
): { sport: Types.Sport | undefined; subSport: Types.SubSport | undefined } {
  const sessionSport = session?.sport
  if (sessionSport !== undefined && sessionSport !== 'generic') {
    return { sport: sessionSport, subSport: session?.subSport }
  }
  if (sportMesg?.sport !== undefined && sportMesg.sport !== 'generic') {
    return { sport: sportMesg.sport, subSport: sportMesg.subSport }
  }
  return { sport: sessionSport, subSport: session?.subSport }
}

function timedRecords(records: RecordMesg[]): Timed[] {
  const out: Timed[] = []
  for (const mesg of records) {
    if (mesg.timestamp instanceof Date) out.push({ tMs: mesg.timestamp.getTime(), mesg })
  }
  return out
}

function timerMessages(messages: EventMesg[]): RawTimerEvent[] {
  return messages.flatMap((message) =>
    message.event === 'timer' &&
    message.timestamp instanceof Date &&
    message.eventType !== undefined
      ? [{ tMs: message.timestamp.getTime(), eventType: message.eventType }]
      : [],
  )
}

/** Gives each record to the first session whose [start, start + elapsed] window contains it. */
function assignToSessions(sessions: SessionMesg[], timed: Timed[]): Unit[] {
  const units: Unit[] = sessions.map((session) => ({ session, records: [] }))
  for (const t of timed) {
    units.find((unit) => inWindow(unit.session, t.tMs))?.records.push(t)
  }
  return units
}

function inWindow(session: SessionMesg | undefined, tMs: number): boolean {
  if (!(session?.startTime instanceof Date)) return false
  const start = session.startTime.getTime()
  const end = start + (session.totalElapsedTime ?? 0) * 1000
  return tMs >= start && tMs <= end
}

function toRaw(t: Timed): RawRecord {
  const r = t.mesg
  return {
    tMs: t.tMs,
    distance: r.distance,
    speed: r.enhancedSpeed ?? r.speed,
    altitude: r.enhancedAltitude ?? r.altitude,
    heartRate: r.heartRate,
    power: r.power,
  }
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
