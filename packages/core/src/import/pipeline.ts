import { DAY_MS } from '../constants'
import type { Activity, Sport } from '../types'
import { routeFromFixes } from '../route/routeShape'
import { MAX_INTERPOLATED_GAP_S, resample, splitAtGaps } from '../fit/resample'
import type { RawRecord, RawTimerEvent, Resampled } from '../fit/resample'
import type { GpsFix } from './gps'
import type { ParseLimits, ParseOptions, ParseResult } from './result'
import { failure, MAX_FILE_SAMPLES } from './result'

const EARLIEST_ACTIVITY_MS = Date.UTC(2000, 0, 1)
const MAX_FUTURE_MS = DAY_MS
/** The shortest activity, in seconds: the records must vouch for at least this much. */
const MIN_SAMPLES = 60
/** The fastest speed a sample may have, per sport. Faster samples are dropped as impossible. */
export const MAX_SPEED_MPS: Record<Sport, number> = { ride: 30, run: 12.5 }
const MAX_POWER_W = 3000
const MIN_HEART_RATE = 25
const MAX_HEART_RATE = 250
/** Below this speed, in m/s, a sample counts as stopped. */
const STOPPED_SPEED_MS = 0.5
/** Share of recorded (not paused) samples that must be stopped for a powered ride to be indoor. */
const STOPPED_SHARE = 0.95
/** A powered ride without positions is indoor only if its altitude spans less than this, in metres. */
const TRAINER_ALTITUDE_RANGE_M = 10

const SHORT_REASON = 'Activity is shorter than one minute'
const SPARSE_REASON = 'Activity is recorded too sparsely: its points are more than 10 seconds apart'
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
  /**
   * The device's running distance when this unit began, in metres. Subtracted from the unit's
   * distance, so a session that follows another counts from where that one ended. Undefined
   * leaves the device's own count, which is the case for a file's first session.
   */
  distanceOrigin?: number
  /** The source marks this unit indoor, e.g. a FIT treadmill or spin sub-sport. */
  indoor: boolean
  /** Whether any record has a position. Without one, indoor is inferred from altitude and speed. */
  hasPosition: boolean
  /** The unit's positions in time order, for its route shape. Absent or empty without GPS. */
  fixes?: GpsFix[]
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

  const outcomes: Outcome[] = []
  for (const [part, segment] of segments.entries()) {
    const outcome = evaluateSegment(segment, {
      unit,
      index,
      part,
      parts: segments.length,
      sport,
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
  drops: Map<RawRecord, number>
  maxSpeed: number
  context: Context
}

/** Resamples one continuous part of a unit into an Activity, or says why it is not one. */
function evaluateSegment(segment: RawRecord[], info: SegmentInfo): Outcome {
  const { unit, index, part, parts, sport, drops, maxSpeed, context } = info
  const { fileName, multi, limits, nowMs } = context
  const short: Outcome = {
    ok: false,
    reason: SHORT_REASON,
    skipped: 'session shorter than one minute',
    fatal: false,
  }
  // Devices record sparsely ("smart recording"), in every format, so a segment is measured by the
  // seconds its records cover rather than by how many records it has.
  if (vouchedSeconds(segment) < MIN_SAMPLES) {
    // When most points are far apart the recording is sparse, not short; say which, so people
    // know why. One long pause after a short effort is still a short activity.
    if (!mostlySparse(segment)) return short
    return {
      ok: false,
      reason: SPARSE_REASON,
      skipped: 'session recorded too sparsely',
      fatal: false,
    }
  }

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
  if (activeSeconds(resampled) < MIN_SAMPLES) return short
  if (resampled.startMs < EARLIEST_ACTIVITY_MS || resampled.startMs > nowMs + MAX_FUTURE_MS) {
    return {
      ok: false,
      reason: DATE_REASON,
      skipped: 'activity date is not plausible',
      fatal: false,
    }
  }
  // A part after a gap of over four hours counts from its own first sample, and a unit that follows
  // another in the same file counts from where the device's running total stood.
  const origin = part === 0 ? (unit.distanceOrigin ?? 0) : (resampled.distance[0] ?? 0)
  subtractDistance(resampled.distance, origin)
  const indoor = unit.indoor || (!unit.hasPosition && isIndoorWithoutPositions(resampled, sport))
  // A speed derived from distance can still exceed the sport's limit; such samples are missing.
  const derivedDropped = clampSpeed(resampled.speed, maxSpeed)
  const dropped = segment.reduce((sum, r) => sum + (drops.get(r) ?? 0), 0) + derivedDropped

  const base = baseName(fileName)
  const idBase = `${resampled.startMs}-${fileName}`
  const id = multi ? `${idBase}#${index}` : idBase
  const name = multi ? `${base} (${sport})` : base
  const route = indoor ? null : routeFromFixes(unit.fixes ?? [], first, last, maxSpeed)
  const activity: Activity = {
    id: parts > 1 ? `${id}.${part + 1}` : id,
    name: parts > 1 ? `${name} (part ${part + 1})` : name,
    sport,
    indoor,
    ...resampled,
    ...(route ? { route } : {}),
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

/**
 * The seconds a segment's records vouch for: one for its first sample, then each gap the resampler
 * bridges, and one second for each longer gap, which it treats as a pause. Two records hours apart
 * vouch for two seconds, while sparse records every few seconds vouch for their whole span.
 */
function vouchedSeconds(segment: RawRecord[]): number {
  let total = 1
  for (let i = 1; i < segment.length; i++) {
    const gapS = (segment[i]!.tMs - segment[i - 1]!.tMs) / 1000
    total += gapS <= MAX_INTERPOLATED_GAP_S ? gapS : 1
  }
  return total
}

/** The seconds of the grid the device was recording: every second that is not paused. */
function activeSeconds(s: Resampled): number {
  let count = 0
  for (let i = 0; i < s.n; i++) if (s.paused[i] !== 1) count++
  return count
}

/** Whether at least half of a segment's gaps are longer than the resampler bridges. */
function mostlySparse(segment: RawRecord[]): boolean {
  let long = 0
  for (let i = 1; i < segment.length; i++) {
    if ((segment[i]!.tMs - segment[i - 1]!.tMs) / 1000 > MAX_INTERPOLATED_GAP_S) long++
  }
  return segment.length > 1 && long * 2 >= segment.length - 1
}

/** Subtracts `origin` from every distance. Distances stay non-decreasing. */
function subtractDistance(distance: Float64Array, origin: number): void {
  if (!Number.isFinite(origin) || origin === 0) return
  for (let i = 0; i < distance.length; i++) distance[i] = distance[i]! - origin
}

/**
 * Whether a unit with no positions is indoor. No altitude means indoor. A cycling unit with power is
 * also indoor when it is stopped for nearly all of its recorded time and its altitude hardly
 * changes: a trainer's barometer reads a few metres of noise, and a missing speed sensor reads as
 * stopped. Paused time is not counted.
 */
function isIndoorWithoutPositions(s: Resampled, sport: Sport): boolean {
  if (!s.hasAltitude) return true
  return (
    sport === 'ride' &&
    s.hasPower &&
    altitudeRange(s) < TRAINER_ALTITUDE_RANGE_M &&
    isStoppedMostly(s)
  )
}

function altitudeRange(s: Resampled): number {
  let low = Infinity
  let high = -Infinity
  for (const h of s.altitude) {
    if (Number.isFinite(h)) {
      low = Math.min(low, h)
      high = Math.max(high, h)
    }
  }
  return high - low
}

function isStoppedMostly(s: Resampled): boolean {
  let recorded = 0
  let stopped = 0
  for (let i = 0; i < s.n; i++) {
    if (s.paused[i] === 1) continue
    recorded++
    // A missing speed (NaN) counts as stopped.
    if (!(s.speed[i]! >= STOPPED_SPEED_MS)) stopped++
  }
  return recorded > 0 && stopped >= STOPPED_SHARE * recorded
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
