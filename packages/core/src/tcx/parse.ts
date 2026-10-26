import type { RawRecord } from '../fit/resample'
import type { GpsTrack } from '../import/gps'
import { activitiesFromUnits, MAX_SPEED_MPS } from '../import/pipeline'
import type { PipelineUnit } from '../import/pipeline'
import type { ParseLimits, ParseOptions, ParseResult } from '../import/result'
import { DEFAULT_PARSE_LIMITS, failure, NO_RECORDS } from '../import/result'
import { parseIsoTime, ZONELESS } from '../import/time'
import {
  fixesOf,
  readNonNegative,
  readNumber,
  readPosition,
  Refusal,
  trackFromPoints,
} from '../import/trackpoints'
import type { LatLon } from '../import/trackpoints'
import type { Sport } from '../types'
import { scanXmlBytes } from '../xml/parse'
import type { XmlHandler } from '../xml/parse'
import { recordedDistance, speedFromDistance } from './distance'

const NOT_TCX = 'Not a TCX file'
const DECODE_FAILED = 'Could not decode TCX file'
const NO_ACTIVITIES = 'File contains no activities'
const NO_ZONE = 'TCX times need a time zone (Z or ±hh:mm)'

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
    if (error instanceof Refusal) return failure(fileName, error.reason, error.code)
    return failure(fileName, DECODE_FAILED, 'corrupt')
  }
}

function parseUnchecked(
  bytes: Uint8Array,
  fileName: string,
  limits: ParseLimits,
  opts: ParseOptions,
): ParseResult {
  if (bytes.length > limits.maxFileBytes) {
    const reason = `TCX file exceeds the ${limits.maxFileBytes}-byte limit`
    return failure(fileName, reason, 'too-large', String(limits.maxFileBytes))
  }
  const units: PipelineUnit[] = []
  scanXmlBytes(bytes, new TcxScanner(units, limits.maxRecordMessages))
  if (units.length === 0) return failure(fileName, NO_ACTIVITIES, 'empty')
  // An unsupported sport is refused by the pipeline with its own reason, so only supported ones count.
  const supported = units.filter((unit) => unit.sport !== null)
  if (supported.length > 0 && supported.every((unit) => unit.records.length === 0)) {
    return failure(fileName, NO_RECORDS, 'empty')
  }
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
      if (local !== 'TrainingCenterDatabase') throw new Refusal(NOT_TCX, 'corrupt')
    } else if (depth === 3 && local === 'Activity' && this.stack[1] === 'Activities') {
      this.activity = openActivity(attrs.Sport)
    } else if (depth === 6 && local === 'Trackpoint' && this.inTrack()) {
      this.trackpoints++
      if (this.trackpoints > this.maxTrackpoints) {
        throw new Refusal(
          `TCX file exceeds the ${this.maxTrackpoints}-record limit`,
          'too-much-data',
        )
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
  if (tMs === ZONELESS) throw new Refusal(NO_ZONE, 'no-date')
  if (tMs === undefined) return undefined
  return {
    tMs,
    position: readPosition(raw.lat, raw.lon),
    distance: readNonNegative(raw.distance),
    altitude: readNumber(raw.altitude),
    heartRate: readNonNegative(raw.heartRate),
    power: readNonNegative(raw.power),
    speed: readNonNegative(raw.speed),
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
    fixes: fixesOf(points),
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
  const track = distance === undefined ? trackFromPoints(points, MAX_SPEED_MPS[sport]) : undefined
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
