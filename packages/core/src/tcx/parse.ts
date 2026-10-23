import { DEFAULT_PARSE_LIMITS } from '../fit/parse'
import type { ParseLimits, ParseOptions, ParseResult } from '../fit/parse'
import type { RawRecord } from '../fit/resample'
import { trackFromFixes } from '../import/gps'
import type { GpsFix, GpsTrack } from '../import/gps'
import { activitiesFromUnits, MAX_SPEED_MPS } from '../import/pipeline'
import type { PipelineUnit } from '../import/pipeline'
import { parseIsoTime, ZONELESS } from '../import/time'
import type { Sport } from '../types'
import { scanXmlBytes } from '../xml/parse'
import type { XmlHandler } from '../xml/parse'

const NOT_TCX = 'Not a TCX file'
const DECODE_FAILED = 'Could not decode TCX file'
const NO_ACTIVITIES = 'File contains no activities'
const NO_ZONE = 'TCX times need a time zone (Z or ±hh:mm)'
/** Speed from DistanceMeters: a centred difference over this window on each side, as in gps.ts. */
const HALF_WINDOW_MS = 10_000
const STILL_SPEED_MS = 0.5
/** A gap longer than this starts a new segment, as in gps.ts. */
const MAX_GAP_MS = 30_000
/** A DistanceMeters drop smaller than this is sensor jitter. A larger one is a lap reset. */
const RESET_M = 1

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/

/** The values read from one Trackpoint, as text. Each element is taken once, the first one. */
type Field = 'time' | 'lat' | 'lon' | 'distance' | 'altitude' | 'heartRate' | 'power' | 'speed'
type RawTrackpoint = Partial<Record<Field, string>>

/** Element paths below a Trackpoint that carry a value we read. */
const FIELD_PATHS = new Map<string, Field>([
  ['Time', 'time'],
  ['Position/LatitudeDegrees', 'lat'],
  ['Position/LongitudeDegrees', 'lon'],
  ['DistanceMeters', 'distance'],
  ['AltitudeMeters', 'altitude'],
  ['HeartRateBpm/Value', 'heartRate'],
  ['Extensions/TPX/Watts', 'power'],
  ['Extensions/TPX/Speed', 'speed'],
])

interface LatLon {
  lat: number
  lon: number
}

/** One valid trackpoint. Each invalid value is left undefined. */
interface Point {
  tMs: number
  position?: LatLon
  distance?: number
  altitude?: number
  heartRate?: number
  power?: number
  speed?: number
}

/** One Activity while its Laps stream past. */
interface OpenActivity {
  sport: Sport | null
  sportLabel: string
  points: Point[]
}

/** The text of the value element being read, until it closes. */
interface OpenField {
  field: Field
  depth: number
  text: string
}

/** Stops the scan with a reason for the user, unlike a malformed document. */
class Refusal extends Error {
  readonly reason: string

  constructor(reason: string) {
    super(reason)
    this.reason = reason
  }
}

/** Parses a TCX file into one unit per Activity, through the same pipeline as FIT. Never throws. */
export function parseTcx(
  bytes: Uint8Array,
  fileName: string,
  limits: ParseLimits = DEFAULT_PARSE_LIMITS,
  opts: ParseOptions = {},
): ParseResult {
  try {
    return parseUnchecked(bytes, fileName, limits, opts)
  } catch (error) {
    if (error instanceof Refusal) return failure(fileName, error.reason)
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
    return failure(fileName, `TCX file exceeds the ${limits.maxFileBytes}-byte limit`)
  }
  const units: PipelineUnit[] = []
  scanXmlBytes(bytes, new TcxScanner(units, limits.maxRecordMessages))
  if (units.length === 0) return failure(fileName, NO_ACTIVITIES)
  return activitiesFromUnits({ fileName, units }, limits, opts)
}

/**
 * Streams the document. It keeps the open Activity and the Trackpoint being read, and appends one
 * unit to `units` when each Activity closes. Element names are matched on their local part.
 */
class TcxScanner implements XmlHandler {
  /** Local names of the open elements. The element at depth d is stack[d - 1]. */
  private readonly stack: string[] = []
  private readonly units: PipelineUnit[]
  private readonly maxTrackpoints: number
  private trackpoints = 0
  private activity: OpenActivity | undefined
  private trackpoint: RawTrackpoint | undefined
  private field: OpenField | undefined

  constructor(units: PipelineUnit[], maxTrackpoints: number) {
    this.units = units
    this.maxTrackpoints = maxTrackpoints
  }

  open(local: string, _name: string, attrs: Record<string, string>, depth: number): void {
    this.stack.push(local)
    if (depth === 1) {
      if (local !== 'TrainingCenterDatabase') throw new Refusal(NOT_TCX)
    } else if (depth === 3 && local === 'Activity' && this.stack[1] === 'Activities') {
      this.activity = openActivity(attrs.Sport)
    } else if (depth === 6 && local === 'Trackpoint' && this.inTrack()) {
      this.trackpoints++
      if (this.trackpoints > this.maxTrackpoints) {
        throw new Refusal(`TCX file exceeds the ${this.maxTrackpoints}-record limit`)
      }
      this.trackpoint = {}
    } else if (this.trackpoint !== undefined && depth > 6) {
      const field = FIELD_PATHS.get(this.stack.slice(6).join('/'))
      if (field !== undefined && this.trackpoint[field] === undefined) {
        this.field = { field, depth, text: '' }
      }
    }
  }

  text(text: string, depth: number): void {
    if (this.field !== undefined && this.field.depth === depth) this.field.text += text
  }

  close(_local: string, _name: string, depth: number): void {
    const field = this.field
    if (field !== undefined && field.depth === depth) {
      this.field = undefined
      if (this.trackpoint !== undefined) this.trackpoint[field.field] = field.text
    }
    if (depth === 6 && this.trackpoint !== undefined) this.closeTrackpoint()
    else if (depth === 3 && this.activity !== undefined) this.closeActivity()
    this.stack.pop()
  }

  /** Whether the open Trackpoint would sit at Activity > Lap > Track > Trackpoint. */
  private inTrack(): boolean {
    const s = this.stack
    return (
      this.activity !== undefined &&
      s[1] === 'Activities' &&
      s[2] === 'Activity' &&
      s[3] === 'Lap' &&
      s[4] === 'Track'
    )
  }

  private closeTrackpoint(): void {
    const raw = this.trackpoint
    this.trackpoint = undefined
    const activity = this.activity
    if (raw === undefined || activity === undefined || activity.sport === null) return
    const point = pointOf(raw)
    if (point !== undefined) activity.points.push(point)
  }

  private closeActivity(): void {
    const activity = this.activity
    this.activity = undefined
    if (activity !== undefined) this.units.push(unitOf(activity))
  }
}

function openActivity(sportName: string | undefined): OpenActivity {
  return { sport: sportOf(sportName), sportLabel: sportName ?? 'unknown', points: [] }
}

function sportOf(name: string | undefined): Sport | null {
  if (name === 'Running') return 'run'
  if (name === 'Biking') return 'ride'
  return null
}

/** A trackpoint with a valid time, or undefined. Invalid values are left undefined. */
function pointOf(raw: RawTrackpoint): Point | undefined {
  const tMs = raw.time === undefined ? undefined : parseIsoTime(raw.time, 'refuse')
  if (tMs === ZONELESS) throw new Refusal(NO_ZONE)
  if (tMs === undefined) return undefined
  return {
    tMs,
    position: positionOf(raw.lat, raw.lon),
    distance: nonNegative(numberOf(raw.distance)),
    altitude: numberOf(raw.altitude),
    heartRate: nonNegative(numberOf(raw.heartRate)),
    power: nonNegative(numberOf(raw.power)),
    speed: nonNegative(numberOf(raw.speed)),
  }
}

/** Maps one Activity to the shared pipeline's input. */
function unitOf(activity: OpenActivity): PipelineUnit {
  const { sport, sportLabel } = activity
  if (sport === null) {
    return { records: [], timerEvents: [], sport, sportLabel, indoor: false, hasPosition: false }
  }
  const points = sortAndDedupe(activity.points)
  const hasPosition = points.some((p) => p.position !== undefined)
  return {
    records: recordsOf(points, sport),
    timerEvents: [],
    sport,
    sportLabel,
    // A trainer ride saved as plain cycling has no positions at all.
    indoor: sport === 'ride' && !hasPosition,
    hasPosition,
  }
}

/**
 * Sorts by time, stably, then drops exact duplicates: same time and same values. Points that share
 * a time but differ are both kept.
 */
function sortAndDedupe(points: Point[]): Point[] {
  const sorted = points.sort((a, b) => a.tMs - b.tMs)
  const out: Point[] = []
  let time = Number.NaN
  let seen = new Set<string>()
  for (const p of sorted) {
    if (p.tMs !== time) {
      time = p.tMs
      seen = new Set()
    }
    const key = JSON.stringify([
      p.position?.lat,
      p.position?.lon,
      p.distance,
      p.altitude,
      p.heartRate,
      p.power,
      p.speed,
    ])
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

/**
 * Records for one Activity. Distance comes from DistanceMeters when any point has it, otherwise
 * from positions. Speed comes from TPX Speed when any point has it, otherwise from the distance
 * (or positions) that was chosen above.
 */
function recordsOf(points: Point[], sport: Sport): RawRecord[] {
  const distance = recordedDistance(points)
  const track = distance === undefined ? positionTrack(points, sport) : undefined
  const finalDistance = distance ?? fromTrack(points, track, 'distanceM')
  let speed: (number | undefined)[]
  if (points.some((p) => p.speed !== undefined)) speed = points.map((p) => p.speed)
  else if (distance !== undefined) speed = speedFromDistance(points, distance)
  else speed = fromTrack(points, track, 'speedMs')
  return points.map((p, i) => ({
    tMs: p.tMs,
    distance: finalDistance[i],
    speed: speed[i],
    altitude: p.altitude,
    heartRate: p.heartRate,
    power: p.power,
  }))
}

/**
 * Cumulative distance from DistanceMeters, or undefined when no point has it. A drop of at least
 * RESET_M is a lap reset: the total so far becomes an offset and the count continues from it. A
 * smaller drop is jitter, so the total stays where it was.
 */
function recordedDistance(points: Point[]): (number | undefined)[] | undefined {
  if (!points.some((p) => p.distance !== undefined)) return undefined
  const out: (number | undefined)[] = []
  let offset = 0
  let raw: number | undefined
  let total = 0
  for (const p of points) {
    const d = p.distance
    if (d === undefined) {
      out.push(undefined)
      continue
    }
    if (raw === undefined || d >= raw) {
      raw = d
    } else if (raw - d < RESET_M) {
      out.push(total)
      continue
    } else {
      offset = total
      raw = d
    }
    total = offset + d
    out.push(total)
  }
  return out
}

/** Speed from cumulative distance, over the points that have one. Undefined where they do not. */
function speedFromDistance(
  points: Point[],
  distance: (number | undefined)[],
): (number | undefined)[] {
  const index: number[] = []
  const times: number[] = []
  const totals: number[] = []
  points.forEach((p, i) => {
    const d = distance[i]
    if (d === undefined) return
    index.push(i)
    times.push(p.tMs)
    totals.push(d)
  })
  const speeds = centredSpeeds(times, totals)
  const out: (number | undefined)[] = points.map(() => undefined)
  index.forEach((pointIndex, k) => {
    out[pointIndex] = speeds[k]
  })
  return out
}

/** Centred-difference speeds, split into segments at gaps longer than MAX_GAP_MS. */
function centredSpeeds(tMs: number[], totals: number[]): number[] {
  const out = tMs.map(() => 0)
  let s0 = 0
  while (s0 < tMs.length) {
    let s1 = s0
    while (s1 + 1 < tMs.length && tMs[s1 + 1]! - tMs[s1]! <= MAX_GAP_MS) s1++
    centredSegment(tMs, totals, s0, s1, out)
    s0 = s1 + 1
  }
  return out.map((v) => (v < STILL_SPEED_MS ? 0 : v))
}

/**
 * Writes the centred speed of points s0..s1 (inclusive) into out. Each point uses the points
 * nearest to its window edges, so a point near the segment edge gets a one-sided window.
 */
function centredSegment(
  tMs: number[],
  totals: number[],
  s0: number,
  s1: number,
  out: number[],
): void {
  const t0 = tMs[s0]!
  const t1 = tMs[s1]!
  let lo = s0
  let hi = s0
  for (let i = s0; i <= s1; i++) {
    const ti = tMs[i]!
    const from = Math.max(t0, Math.min(ti - HALF_WINDOW_MS, t1 - 2 * HALF_WINDOW_MS))
    const to = Math.min(t1, Math.max(ti + HALF_WINDOW_MS, t0 + 2 * HALF_WINDOW_MS))
    lo = nearestFrom(tMs, lo, s1, from)
    hi = nearestFrom(tMs, hi, s1, to)
    const dt = tMs[hi]! - tMs[lo]!
    out[i] = dt > 0 ? ((totals[hi]! - totals[lo]!) * 1000) / dt : 0
  }
}

/** Advances p while the next time is at least as close to target. Times are sorted. */
function nearestFrom(tMs: number[], p: number, last: number, target: number): number {
  let q = p
  while (q < last && Math.abs(tMs[q + 1]! - target) <= Math.abs(tMs[q]! - target)) q++
  return q
}

/** Distance and speed from positions, when any point has one. Undefined without positions. */
function positionTrack(points: Point[], sport: Sport): GpsTrack | undefined {
  const fixes: GpsFix[] = []
  for (const p of points) {
    if (p.position !== undefined) fixes.push({ t: p.tMs, lat: p.position.lat, lon: p.position.lon })
  }
  if (fixes.length === 0) return undefined
  return trackFromFixes(fixes, { maxSpeedMs: MAX_SPEED_MPS[sport] })
}

/** The track's values at each point's time. Points without a fix in the track get undefined. */
function fromTrack(
  points: Point[],
  track: GpsTrack | undefined,
  key: 'distanceM' | 'speedMs',
): (number | undefined)[] {
  if (track === undefined) return points.map(() => undefined)
  const values = track[key]
  const byTime = new Map<number, number>()
  track.tMs.forEach((t, i) => byTime.set(t, values[i]!))
  return points.map((p) => byTime.get(p.tMs))
}

function positionOf(lat: string | undefined, lon: string | undefined): LatLon | undefined {
  const latitude = numberOf(lat)
  const longitude = numberOf(lon)
  if (latitude === undefined || longitude === undefined) return undefined
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined
  return { lat: latitude, lon: longitude }
}

function numberOf(text: string | undefined): number | undefined {
  const trimmed = text?.trim() ?? ''
  if (!NUMBER.test(trimmed)) return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

function nonNegative(value: number | undefined): number | undefined {
  return value !== undefined && value >= 0 ? value : undefined
}

function failure(fileName: string, reason: string): ParseResult {
  return { ok: false, fileName, reason }
}
