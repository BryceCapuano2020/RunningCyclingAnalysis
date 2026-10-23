import type { Activity, Sport } from '../types'
import type { ParseLimits, ParseOptions, ParseResult } from '../fit/parse'
import { resample, splitAtGaps } from '../fit/resample'
import type { RawRecord, RawTimerEvent } from '../fit/resample'

/** 48 hours at 1 Hz: the most grid samples one file may produce, summed over its units. */
export const MAX_FILE_SAMPLES = 172_800
const DAY_MS = 24 * 60 * 60 * 1000
const EARLIEST_ACTIVITY_MS = Date.UTC(2000, 0, 1)
const MAX_FUTURE_MS = DAY_MS
const MIN_RECORDS = 60
/** The fastest speed a sample may have, per sport. Faster samples are dropped as impossible. */
export const MAX_SPEED_MPS: Record<Sport, number> = { ride: 30, run: 12.5 }
const MAX_POWER_W = 3000
const MIN_HEART_RATE = 25
const MAX_HEART_RATE = 250

const SHORT_REASON = 'Activity is shorter than one minute'
const TOO_LONG = 'Activity is longer than 48 hours'
const TOO_MUCH = 'File contains too much data'
const DATE_REASON = 'Activity date is not plausible'

/**
 * One continuous source of records: a FIT session, or one GPX or TCX activity. Each unit becomes
 * one or more Activities (a gap of more than four hours starts a new one).
 */
export interface PipelineUnit {
  /** Records of this unit, in any order. Times are epoch milliseconds. */
  records: RawRecord[]
  /** Timer start and stop events of this unit, in any order. May be empty. */
  timerEvents: RawTimerEvent[]
  /** The mapped sport, or null when the source's sport is not supported and the unit is refused. */
  sport: Sport | null
  /** The source's own sport name, used in the refusal `Unsupported sport: <sportLabel>`. */
  sportLabel: string
  /** Replaces the default refusal when sport is null, e.g. FIT e-bike sessions. */
  refusal?: { reason: string; skipped: string }
  /** The source marks this unit indoor, e.g. a FIT treadmill or spin sub-sport. */
  indoor: boolean
  /** Whether any record has a position. Without a position and without altitude it is indoor. */
  hasPosition: boolean
}

/** A pipeline input for one file that holds a single unit. */
export interface PipelineFile extends PipelineUnit {
  /** The file name, used for the activity id and name. */
  fileName: string
}

/**
 * Turns the records of one unit into Activities. Use activitiesFromUnits when a file holds several
 * units. Never throws.
 */
export function activitiesFromRecords(
  input: PipelineFile,
  limits: ParseLimits,
  opts: ParseOptions,
): ParseResult {
  return activitiesFromUnits({ fileName: input.fileName, units: [input] }, limits, opts)
}

/**
 * Turns the units of one file into Activities. With several units each activity id gets a `#index`
 * suffix and each name gets its sport, and the sample budget is shared by all units. Never throws.
 */
export function activitiesFromUnits(
  input: { fileName: string; units: PipelineUnit[] },
  limits: ParseLimits,
  opts: ParseOptions,
): ParseResult {
  const { fileName, units } = input
  const context: Context = {
    fileName,
    multi: units.length > 1,
    limits,
    nowMs: opts.nowMs ?? Date.now(),
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
  const skipped: string[] = []
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
 * The file name without its directory and without its activity extension: .fit, .gpx or .tcx,
 * each optionally followed by .gz.
 */
export function baseName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName
  return base.replace(/\.(fit|gpx|tcx)(\.gz)?$/i, '')
}

type Outcome =
  | { ok: true; activity: Activity; dropped: number }
  | { ok: false; reason: string; skipped: string; fatal: boolean }

interface Context {
  fileName: string
  multi: boolean
  limits: ParseLimits
  nowMs: number
  /** Grid samples already allocated for this file. */
  usedSamples: number
}

/**
 * One outcome per continuous part of a unit. Stops at the first fatal outcome, so nothing after a
 * refused file is allocated.
 */
function evaluateUnit(unit: PipelineUnit, index: number, context: Context): Outcome[] {
  const sport = unit.sport
  if (sport === null) {
    const refusal = unit.refusal ?? {
      reason: `Unsupported sport: ${unit.sportLabel}`,
      skipped: `${unit.sportLabel} session skipped`,
    }
    return [{ ok: false, reason: refusal.reason, skipped: refusal.skipped, fatal: false }]
  }
  const maxSpeed = MAX_SPEED_MPS[sport]
  const drops = new Map<RawRecord, number>()
  const segments = splitAtGaps(unit.records.map((r) => clean(r, maxSpeed, drops)))

  // A trainer ride saved as plain cycling has neither a position nor altitude, so it is indoor too.
  const hasAltitude = unit.records.some((r) => r.altitude !== undefined)
  const indoor = unit.indoor || (!unit.hasPosition && !hasAltitude)
  const outcomes: Outcome[] = []
  for (const [part, segment] of segments.entries()) {
    const outcome = evaluateSegment(segment, {
      unit,
      index,
      part,
      parts: segments.length,
      sport,
      indoor,
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
  unit: PipelineUnit
  index: number
  part: number
  parts: number
  sport: Sport
  indoor: boolean
  drops: Map<RawRecord, number>
  maxSpeed: number
  context: Context
}

/** Resamples one continuous part of a unit into an Activity, or says why it is not one. */
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

  const events = unit.timerEvents.filter((e) => e.tMs >= first && e.tMs <= last)
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

/** Drops impossible values (sets them to undefined) and counts them per record. */
function clean(r: RawRecord, maxSpeed: number, drops: Map<RawRecord, number>): RawRecord {
  const counts = { dropped: 0 }
  const cleaned: RawRecord = {
    tMs: r.tMs,
    distance: r.distance,
    speed: keepWithin(r.speed, 0, maxSpeed, counts),
    altitude: r.altitude,
    heartRate: keepWithin(r.heartRate, MIN_HEART_RATE, MAX_HEART_RATE, counts),
    power: keepWithin(r.power, 0, MAX_POWER_W, counts),
  }
  if (counts.dropped > 0) drops.set(cleaned, counts.dropped)
  return cleaned
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

function failure(fileName: string, reason: string): ParseResult {
  return { ok: false, fileName, reason }
}
