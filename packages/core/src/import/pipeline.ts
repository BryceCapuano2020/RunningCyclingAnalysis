import { DAY_MS } from '../constants'
import type { Activity, Sport } from '../types'
import { routeFromFixes } from '../route/routeShape'
import { MAX_INTERPOLATED_GAP_S, resample, splitAtGaps } from '../fit/resample'
import type { RawRecord, RawTimerEvent, Resampled } from '../fit/resample'
import type { GpsFix } from './gps'
import type { ParseLimits, ParseOptions, ParseResult, RejectCode, Rejection } from './result'
import { SPORT_TRACE } from '../workbench/sportTrace'
import type { CadenceUnit } from '../workbench/types'
import { failure, MAX_FILE_SAMPLES, refused } from './result'
import { nameOfLeg, withStartTimesWhereShared } from './names'
import { isIndoorWithoutPositions } from './indoor'
import { cleanRecord } from './cleanRecord'
import { lapsForSegment } from './laps'

const EARLIEST_ACTIVITY_MS = Date.UTC(2000, 0, 1)
const MAX_FUTURE_MS = DAY_MS
/** The shortest activity, in seconds: the records must vouch for at least this much. */
const MIN_SAMPLES = 60
/** The fastest speed a sample may have, per sport. Faster samples are dropped as impossible. */
export const MAX_SPEED_MPS: Record<Sport, number> = {
  ride: SPORT_TRACE.ride.maxSpeedMs,
  run: SPORT_TRACE.run.maxSpeedMs,
}

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
  /** Explicit lap boundaries retained by a source format, in epoch milliseconds. */
  laps?: Array<{ startMs: number; endMs: number; label?: string }>
  cadenceUnit?: CadenceUnit
  /** Timer start and stop events of this unit, in any order. May be empty. */
  timerEvents: RawTimerEvent[]
  /** The mapped sport, or null when the source's sport is not supported and the unit is refused. */
  sport: Sport | null
  /** The source's own sport name, used in the refusal `Unsupported sport: <sportLabel>`. */
  sportLabel: string
  /** The name is the type the export's list gives, which the refusal says. */
  sportFromList?: boolean
  /** Replaces the default refusal when sport is null, e.g. FIT e-bike sessions. */
  refusal?: { skipped: string } & Rejection
  /**
   * The device's running distance when this unit began, in metres. Subtracted from the unit's
   * distance, so a session that follows another counts from where that one ended. Undefined
   * leaves the device's own count, which is the case for a file's first session.
   */
  distanceOrigin?: number
  /** The source marks this unit indoor, e.g. a FIT treadmill or spin sub-sport. */
  indoor: boolean
  /**
   * Whether any record has a usable position: not a (0,0) placeholder, not out of range.
   * Without one, indoor is inferred from altitude and speed.
   */
  hasPosition: boolean
  /** The unit's positions in time order, for its route shape. Absent or empty without GPS. */
  fixes?: GpsFix[]
  /** The activity's own title in its file, such as a GPX track name. Device defaults are dropped. */
  title?: string
}

/** A pipeline input for one file that holds a single unit. */
export interface PipelineFile extends PipelineUnit {
  /** The file name, used for the activity id. */
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
 * suffix, and a name that two activities of the file share gets the start time. The sample budget is
 * shared by all units. Never throws.
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
    activityName: opts.activityName,
    sessionKey: opts.sessionKey,
  }

  const outcomes: Outcome[] = []
  for (const [index, unit] of units.entries()) {
    for (const outcome of evaluateUnit(unit, index, context)) {
      outcomes.push(outcome)
      if (!outcome.ok && outcome.fatal) {
        return failure(fileName, outcome.reason, outcome.code, outcome.detail)
      }
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
  if (activities.length === 0) {
    return refused(fileName, pickReason(outcomes))
  }
  return { ok: true, activities: withStartTimesWhereShared(activities), skipped, droppedValues }
}

type Outcome =
  | { ok: true; activity: Activity; dropped: number }
  | ({ ok: false; skipped: string; fatal: boolean } & Rejection)

interface Context {
  fileName: string
  multi: boolean
  limits: ParseLimits
  nowMs: number
  /** Grid samples already allocated for this file. */
  usedSamples: number
  /** The name the file's export gives, which wins over a title in the file. */
  activityName?: string
  /** The upload's id, which the legs of one upload share as their session key. */
  sessionKey?: string
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
      code: 'unsupported-sport' as const,
      detail: unit.sportLabel,
      listed: unit.sportFromList,
      skipped: `${unit.sportLabel} session skipped`,
    }
    return [{ ...refusal, ok: false, fatal: false }]
  }
  const maxSpeed = MAX_SPEED_MPS[sport]
  const drops = new Map<RawRecord, number>()
  const segments = splitAtGaps(unit.records.map((r) => cleanRecord(r, maxSpeed, drops)))

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

/** A refusal of one part of a file, or of the whole file when it is fatal. */
function refusalOf(
  reason: string,
  code: RejectCode,
  skipped: string,
  fatal = false,
): Extract<Outcome, { ok: false }> {
  return { ok: false, reason, code, skipped, fatal }
}
const SHORT_OUTCOME = refusalOf(SHORT_REASON, 'too-short', 'session shorter than one minute')
const SPARSE_OUTCOME = refusalOf(SPARSE_REASON, 'too-sparse', 'session recorded too sparsely')
const DATE_OUTCOME = refusalOf(DATE_REASON, 'implausible-date', 'activity date is not plausible')

/** The refusal for a segment too short to count, or null when it is long enough to resample. */
function tooShort(segment: RawRecord[]): Outcome | null {
  // Devices record sparsely ("smart recording"), in every format, so a segment is measured by the
  // seconds its records cover rather than by how many records it has.
  if (vouchedSeconds(segment) >= MIN_SAMPLES) return null
  // When most points are far apart the recording is sparse, not short; say which, so people know
  // why. One long pause after a short effort is still a short activity.
  return mostlySparse(segment) ? SPARSE_OUTCOME : SHORT_OUTCOME
}

/**
 * Reserves the grid samples a segment needs. Null when it may be resampled; otherwise the fatal
 * refusal for a segment longer than 48 hours, or for a file with no room left for it.
 */
function reserveSamples(segment: RawRecord[], context: Context): Outcome | null {
  // The grid length is known before anything is allocated, so a long file is refused up front.
  const first = segment[0]!.tMs
  const last = segment[segment.length - 1]!.tMs
  const samples = Math.round((last - first) / 1000) + 1
  if (samples > MAX_FILE_SAMPLES) {
    return refusalOf(TOO_LONG, 'too-long', 'activity longer than 48 hours', true)
  }
  if (context.usedSamples + samples > MAX_FILE_SAMPLES) {
    return refusalOf(TOO_MUCH, 'too-much-data', 'file contains too much data', true)
  }
  context.usedSamples += samples
  return null
}

/** Resamples a segment onto its 1 Hz grid, or says why the grid cannot be made. */
function resampleSegment(
  segment: RawRecord[],
  unit: PipelineUnit,
  limits: ParseLimits,
): { resampled: Resampled } | { refused: Outcome } {
  const first = segment[0]!.tMs
  const last = segment[segment.length - 1]!.tMs
  const events = unit.timerEvents.filter((e) => e.tMs >= first && e.tMs <= last)
  try {
    return { resampled: resample(segment, events, limits.maxActivitySeconds) }
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    return {
      refused: {
        ok: false,
        reason: error.message,
        code: 'too-long',
        skipped: 'activity exceeds the supported time range',
        fatal: false,
      },
    }
  }
}

/** Resamples one continuous part of a unit into an Activity, or says why it is not one. */
function evaluateSegment(segment: RawRecord[], info: SegmentInfo): Outcome {
  const { unit, index, part, parts, sport, drops, maxSpeed, context } = info
  const { fileName, multi, nowMs } = context
  const short = tooShort(segment)
  if (short !== null) return short
  const full = reserveSamples(segment, context)
  if (full !== null) return full

  const grid = resampleSegment(segment, unit, context.limits)
  if ('refused' in grid) return grid.refused
  const { resampled } = grid
  if (activeSeconds(resampled) < MIN_SAMPLES) return SHORT_OUTCOME
  if (resampled.startMs < EARLIEST_ACTIVITY_MS || resampled.startMs > nowMs + MAX_FUTURE_MS) {
    return DATE_OUTCOME
  }
  // A part after a gap of over four hours counts from its own first sample, and a unit that follows
  // another in the same file counts from where the device's running total stood.
  const origin = part === 0 ? (unit.distanceOrigin ?? 0) : (resampled.distance[0] ?? 0)
  subtractDistance(resampled.distance, origin)
  const indoor = unit.indoor || (!unit.hasPosition && isIndoorWithoutPositions(resampled, sport))
  // A speed derived from distance can still exceed the sport's limit; such samples are missing.
  const derivedDropped = clampSpeed(resampled.speed, maxSpeed)
  const dropped = segment.reduce((sum, r) => sum + (drops.get(r) ?? 0), 0) + derivedDropped

  const idBase = `${resampled.startMs}-${fileName}`
  const id = multi ? `${idBase}#${index}` : idBase
  const name = nameOfLeg({
    exportName: context.activityName,
    title: unit.title,
    sport,
    startMs: resampled.startMs,
    multi,
    part: parts > 1 ? part + 1 : undefined,
  })
  const first = segment[0]!.tMs
  const last = segment[segment.length - 1]!.tMs
  const route = indoor ? null : routeFromFixes(unit.fixes ?? [], first, last, maxSpeed)
  // The legs of one upload, and the parts of a unit split by a gap, share the upload as their session.
  // Without an upload id there is no session, rather than one keyed by the name alone.
  const sessioned = (multi || parts > 1) && context.sessionKey !== undefined
  const activity: Activity = {
    id: parts > 1 ? `${id}.${part + 1}` : id,
    name,
    sport,
    indoor,
    ...resampled,
    ...(resampled.cadence && unit.cadenceUnit ? { cadenceUnit: unit.cadenceUnit } : {}),
    ...(unit.laps === undefined
      ? {}
      : { laps: lapsForSegment(unit.laps, resampled.startMs, resampled.n) }),
    ...(route ? { route } : {}),
    ...(sessioned ? { sessionKey: context.sessionKey } : {}),
  }
  return { ok: true, activity, dropped }
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
function pickReason(outcomes: Outcome[]): Rejection {
  const refusals = outcomes.filter((o) => !o.ok)
  const specific = refusals.find((o) => o.reason !== SHORT_REASON) ?? refusals[0]
  if (specific === undefined) return { reason: SHORT_REASON, code: 'too-short' }
  const { reason, code, detail, listed } = specific
  return { reason, code, detail, listed }
}
