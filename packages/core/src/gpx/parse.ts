import type { RawRecord } from '../fit/resample'
import { activitiesFromUnits, MAX_SPEED_MPS } from '../import/pipeline'
import type { PipelineUnit } from '../import/pipeline'
import type { ParseLimits, ParseOptions, ParseResult } from '../import/result'
import { DEFAULT_PARSE_LIMITS, failure, NO_RECORDS } from '../import/result'
import { parseIsoTime } from '../import/time'
import { fileTitle } from '../import/names'
import {
  fixesOf,
  readNonNegative,
  readNumber,
  readPosition,
  Refusal,
  trackFromPoints,
} from '../import/trackpoints'
import type { LatLon } from '../import/trackpoints'
import { scanXmlBytes, XmlError } from '../xml/parse'
import type { XmlHandler } from '../xml/parse'
import { sportOf } from './sport'

const NOT_GPX = 'Not a GPX file'
const DECODE_FAILED = 'Could not decode GPX file'

const POWER_NAMES = new Set(['power', 'PowerInWatts'])
/** Elements whose own text is read when they close. */
const TEXT_ROLES = new Set(['type', 'trackName', 'ele', 'time', 'heartRate', 'power'])

/** One trkpt with a valid time. Position, altitude and extensions are optional. */
interface Point {
  tMs: number
  position: LatLon | undefined
  altitude: number | undefined
  heartRate: number | undefined
  power: number | undefined
}

/** The trkpt being read. Each value is taken from the first child or extension that gives one. */
interface OpenPoint {
  position: LatLon | undefined
  tMs: number | undefined
  altitude: number | undefined
  heartRate: number | undefined
  power: number | undefined
  eleSeen: boolean
  timeSeen: boolean
}

/** The trk being read. */
interface OpenTrack {
  type: string | undefined
  typeSeen: boolean
  name: string | undefined
  nameSeen: boolean
  anyPosition: boolean
  points: Point[]
  /** Trackpoints without a valid time. */
  untimed: number
}

/** What an open element is, decided when it opens. */
type Role =
  | 'root'
  | 'track'
  | 'type'
  | 'trackName'
  | 'segment'
  | 'point'
  | 'ele'
  | 'time'
  | 'heartRate'
  | 'power'
  | 'other'

interface Frame {
  role: Role
  text: string
}

/**
 * Parses a GPX 1.0 or 1.1 file into 1 Hz Activities, one per track. The file is streamed: each
 * trackpoint is kept until its track ends, and no document tree is built. Distance and speed come
 * from trackFromFixes. Pauses come from the pipeline's gap rule, because GPX has no timer events.
 * Never throws.
 */
export function parseGpx(
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
    return failure(fileName, `GPX file exceeds the ${limits.maxFileBytes}-byte limit`)
  }
  const reader = new GpxReader(limits.maxRecordMessages)
  try {
    scanXmlBytes(bytes, reader)
  } catch (error) {
    if (error instanceof Refusal) return failure(fileName, error.reason)
    if (error instanceof XmlError) return failure(fileName, NOT_GPX)
    throw error
  }
  if (reader.units.every((unit) => unit.records.length === 0)) {
    return failure(fileName, NO_RECORDS)
  }
  const result = activitiesFromUnits({ fileName, units: reader.units }, limits, opts)
  if (!result.ok) return result
  return { ...result, droppedValues: result.droppedValues + reader.dropped }
}

/**
 * Reads a GPX file event by event. It keeps the open elements and the trackpoint being read, and
 * each track's points until the track ends, so memory follows the points rather than the nodes.
 */
class GpxReader implements XmlHandler {
  /** One unit per trk, in file order. */
  readonly units: PipelineUnit[] = []
  /** Trackpoints dropped for having no valid time, a duplicate time, or a rejected position. */
  dropped = 0
  private readonly frames: Frame[] = []
  private readonly maxPoints: number
  private pointCount = 0
  private creator: string | undefined = undefined
  private track: OpenTrack | undefined = undefined
  private point: OpenPoint | undefined = undefined

  constructor(maxPoints: number) {
    this.maxPoints = maxPoints
  }

  open(local: string, _name: string, attrs: Record<string, string>, depth: number): void {
    const parent = this.frames.at(-1)?.role
    this.frames.push({ role: this.start(local, attrs, depth, parent), text: '' })
  }

  text(text: string): void {
    const frame = this.frames.at(-1)
    if (frame !== undefined && TEXT_ROLES.has(frame.role)) frame.text += text
  }

  close(): void {
    const frame = this.frames.pop()
    if (frame === undefined) return
    const point = this.point
    switch (frame.role) {
      case 'track':
        this.finishTrack()
        break
      case 'point':
        this.finishPoint()
        break
      case 'type':
        if (this.track !== undefined) this.track.type = nonBlank(frame.text)
        break
      case 'trackName':
        if (this.track !== undefined) this.track.name = nonBlank(frame.text)
        break
      case 'ele':
        if (point !== undefined) point.altitude = readNumber(frame.text)
        break
      case 'time':
        if (point !== undefined) point.tMs = parseIsoTime(frame.text, 'utc')
        break
      case 'heartRate':
        if (point !== undefined && point.heartRate === undefined) {
          point.heartRate = readNonNegative(frame.text)
        }
        break
      case 'power':
        if (point !== undefined && point.power === undefined) {
          point.power = readNonNegative(frame.text)
        }
        break
      default:
        break
    }
  }

  /** Decides what an element is from its parent, and starts the state it needs. */
  private start(
    local: string,
    attrs: Record<string, string>,
    depth: number,
    parent: Role | undefined,
  ): Role {
    if (depth === 1) {
      if (local !== 'gpx') throw new Refusal(NOT_GPX)
      this.creator = attrs.creator
      return 'root'
    }
    if (parent === 'root' && local === 'trk') {
      this.track = {
        type: undefined,
        typeSeen: false,
        name: undefined,
        nameSeen: false,
        anyPosition: false,
        points: [],
        untimed: 0,
      }
      return 'track'
    }
    const track = this.track
    if (track !== undefined && parent === 'track') {
      if (local === 'type' && !track.typeSeen) {
        track.typeSeen = true
        return 'type'
      }
      if (local === 'name' && !track.nameSeen) {
        track.nameSeen = true
        return 'trackName'
      }
      if (local === 'trkseg') return 'segment'
    }
    if (parent === 'segment' && local === 'trkpt') {
      this.startPoint(attrs)
      return 'point'
    }
    const point = this.point
    if (point !== undefined) {
      if (parent === 'point') {
        if (local === 'ele' && !point.eleSeen) {
          point.eleSeen = true
          return 'ele'
        }
        if (local === 'time' && !point.timeSeen) {
          point.timeSeen = true
          return 'time'
        }
      }
      // Extensions can sit at any depth inside the point, as in Garmin's TrackPointExtension.
      if (local === 'hr' && point.heartRate === undefined) return 'heartRate'
      if (POWER_NAMES.has(local) && point.power === undefined) return 'power'
    }
    return 'other'
  }

  private startPoint(attrs: Record<string, string>): void {
    this.pointCount++
    if (this.pointCount > this.maxPoints) {
      throw new Refusal(`GPX file exceeds the ${this.maxPoints}-record limit`)
    }
    this.point = {
      position: readPosition(attrs.lat, attrs.lon),
      tMs: undefined,
      altitude: undefined,
      heartRate: undefined,
      power: undefined,
      eleSeen: false,
      timeSeen: false,
    }
  }

  private finishPoint(): void {
    const point = this.point
    const track = this.track
    this.point = undefined
    if (point === undefined || track === undefined) return
    if (point.position !== undefined) track.anyPosition = true
    if (point.tMs === undefined) {
      track.untimed++
      return
    }
    track.points.push({
      tMs: point.tMs,
      position: point.position,
      altitude: point.altitude,
      heartRate: point.heartRate,
      power: point.power,
    })
  }

  private finishTrack(): void {
    const track = this.track
    this.track = undefined
    if (track === undefined) return
    const built = buildUnit(track, this.creator)
    this.units.push(built.unit)
    this.dropped += built.dropped
  }
}

/**
 * Sorts one track's points by time, drops repeated times, and maps the points to pipeline records.
 * A track with no sport is refused by the pipeline, so its speeds are only placeholders.
 */
function buildUnit(
  track: OpenTrack,
  creator: string | undefined,
): { unit: PipelineUnit; dropped: number } {
  // Array.prototype.sort is stable, so the first of several equal times is the one kept.
  const sorted = track.points.sort((a, b) => a.tMs - b.tMs)
  let dropped = track.untimed
  const ordered: Point[] = []
  for (const point of sorted) {
    if (ordered.at(-1)?.tMs === point.tMs) dropped++
    else ordered.push(point)
  }

  const choice = sportOf(track.type, creator)
  const motion = toRecords(ordered, MAX_SPEED_MPS[choice.sport ?? 'ride'])
  dropped += motion.rejected
  const unit: PipelineUnit = {
    records: motion.records,
    timerEvents: [],
    sport: choice.sport,
    sportLabel: choice.sportLabel,
    indoor: choice.indoor,
    hasPosition: track.anyPosition,
    refusal: choice.refusal,
    fixes: fixesOf(ordered),
    title: fileTitle(track.name),
  }
  return { unit, dropped }
}

/**
 * Turns time-ordered points into records. Positioned points are measured together by trackFromFixes.
 * Each one takes distance and speed from the accepted fix nearest in time. For an accepted point that
 * is itself, and for a rejected point it is the closest kept fix, with ties going to the earlier one.
 * Points without a position have no distance or speed. Heart rate, power and altitude always come
 * from the point itself.
 */
function toRecords(
  points: Point[],
  maxSpeedMs: number,
): { records: RawRecord[]; rejected: number } {
  const track = trackFromPoints(points, maxSpeedMs)

  const records: RawRecord[] = []
  let nearest = 0
  for (const point of points) {
    const record: RawRecord = {
      tMs: point.tMs,
      altitude: point.altitude,
      heartRate: point.heartRate,
      power: point.power,
    }
    if (point.position !== undefined && track.tMs.length > 0) {
      const at = point.tMs
      while (
        nearest + 1 < track.tMs.length &&
        Math.abs(track.tMs[nearest + 1]! - at) < Math.abs(track.tMs[nearest]! - at)
      ) {
        nearest++
      }
      record.distance = track.distanceM[nearest]!
      record.speed = track.speedMs[nearest]!
    }
    records.push(record)
  }
  return { records, rejected: track.rejected }
}

/** The trimmed text, or undefined when it is blank. */
function nonBlank(text: string): string | undefined {
  const trimmed = text.trim()
  return trimmed === '' ? undefined : trimmed
}
