import { activitiesFromUnits, MAX_SPEED_MPS } from '../import/pipeline'
import { SPORT_TRACE } from '../workbench/sportTrace'
import type { PipelineUnit } from '../import/pipeline'
import type { ParseLimits, ParseOptions, ParseResult } from '../import/result'
import { DEFAULT_PARSE_LIMITS, failure, NO_RECORDS } from '../import/result'
import { parseIsoTime } from '../import/time'
import { fileTitle } from '../import/names'
import { sportOfType } from '../import/sportType'
import {
  appendField,
  fixesOf,
  hasUsablePosition,
  readNonNegative,
  readNumber,
  readPosition,
  Refusal,
} from '../import/trackpoints'
import type { LatLon } from '../import/trackpoints'
import { scanXmlBytes, XmlError } from '../xml/parse'
import type { XmlHandler } from '../xml/parse'
import { recordsOf } from './records'
import type { GpxPoint } from './records'

const NOT_GPX = 'Not a GPX file'
const DECODE_FAILED = 'Could not decode GPX file'

const POWER_NAMES = new Set(['power', 'PowerInWatts'])
/** Elements whose own text is read when they close. */
const TEXT_ROLES = new Set([
  'type',
  'trackName',
  'ele',
  'time',
  'heartRate',
  'power',
  'cadence',
  'temperature',
])

/** One trkpt with a valid time. Position, altitude and extensions are optional. */
type Point = GpxPoint

/** The trkpt being read. Each value is taken from the first child or extension that gives one. */
interface OpenPoint {
  position: LatLon | undefined
  tMs: number | undefined
  altitude: number | undefined
  heartRate: number | undefined
  power: number | undefined
  cadence: number | undefined
  temperature: number | undefined
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
  | 'cadence'
  | 'temperature'
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
    const reason = `GPX file exceeds the ${limits.maxFileBytes}-byte limit`
    return failure(fileName, reason, 'too-large', String(limits.maxFileBytes))
  }
  const reader = new GpxReader(limits.maxRecordMessages, opts.activityType)
  try {
    scanXmlBytes(bytes, reader)
  } catch (error) {
    if (error instanceof Refusal) return failure(fileName, error.reason, error.code)
    if (error instanceof XmlError) return failure(fileName, NOT_GPX, 'corrupt')
    throw error
  }
  const units = reader.finish()
  if (units.every(readsAsEmpty)) return failure(fileName, NO_RECORDS, 'empty')
  const result = activitiesFromUnits({ fileName, units }, limits, opts)
  if (!result.ok) return result
  return { ...result, droppedValues: result.droppedValues + reader.dropped }
}

/**
 * Reads a GPX file event by event. It keeps the open elements and the trackpoint being read, and
 * each track's points until the track ends, so memory follows the points rather than the nodes.
 */
class GpxReader implements XmlHandler {
  /** One unit per trk, in file order. */
  private readonly units: PipelineUnit[] = []
  /** Trackpoints dropped for having no valid time, a duplicate time, or a rejected position. */
  dropped = 0
  private readonly frames: Frame[] = []
  private readonly maxPoints: number
  /** The type the export's list gives the activity, for a track that names no sport. */
  private readonly activityType: string | undefined
  private pointCount = 0
  private creator: string | undefined = undefined
  private track: OpenTrack | undefined = undefined
  private point: OpenPoint | undefined = undefined

  constructor(maxPoints: number, activityType: string | undefined) {
    this.maxPoints = maxPoints
    this.activityType = activityType
  }

  /**
   * The units read. A file with no track at all holds one empty unit when the export's list says what
   * the activity was, so that a walk or a gym session with nothing recorded is reported as one.
   */
  finish(): PipelineUnit[] {
    if (this.units.length > 0 || this.activityType === undefined) return this.units
    return [buildUnit(newTrack(), this.creator, this.activityType).unit]
  }

  open(local: string, _name: string, attrs: Record<string, string>, depth: number): void {
    const parent = this.frames.at(-1)?.role
    this.frames.push({ role: this.start(local, attrs, depth, parent), text: '' })
  }

  text(text: string): void {
    const frame = this.frames.at(-1)
    if (frame !== undefined && TEXT_ROLES.has(frame.role))
      frame.text = appendField(frame.text, text)
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
      case 'cadence':
        if (point !== undefined && point.cadence === undefined) {
          point.cadence = readNonNegative(frame.text)
        }
        break
      case 'temperature':
        if (point !== undefined && point.temperature === undefined) {
          point.temperature = readNumber(frame.text)
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
      if (local !== 'gpx') throw new Refusal(NOT_GPX, 'corrupt')
      this.creator = attrs.creator
      return 'root'
    }
    if (parent === 'root' && local === 'trk') {
      this.track = newTrack()
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
        if (local === 'cad' || local === 'cadence') return 'cadence'
        if (local === 'atemp' || local === 'temperature') return 'temperature'
      }
      // Extensions can sit at any depth inside the point, as in Garmin's TrackPointExtension.
      if (local === 'hr' && point.heartRate === undefined) return 'heartRate'
      if (POWER_NAMES.has(local) && point.power === undefined) return 'power'
      if ((local === 'cad' || local === 'RunCadence') && point.cadence === undefined)
        return 'cadence'
      if ((local === 'atemp' || local === 'Temp') && point.temperature === undefined)
        return 'temperature'
    }
    return 'other'
  }

  private startPoint(attrs: Record<string, string>): void {
    this.pointCount++
    if (this.pointCount > this.maxPoints) {
      throw new Refusal(`GPX file exceeds the ${this.maxPoints}-record limit`, 'too-much-data')
    }
    this.point = {
      position: readPosition(attrs.lat, attrs.lon),
      tMs: undefined,
      altitude: undefined,
      heartRate: undefined,
      power: undefined,
      cadence: undefined,
      temperature: undefined,
      eleSeen: false,
      timeSeen: false,
    }
  }

  private finishPoint(): void {
    const point = this.point
    const track = this.track
    this.point = undefined
    if (point === undefined || track === undefined) return
    if (hasUsablePosition(point.position)) track.anyPosition = true
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
      cadence: point.cadence,
      temperature: point.temperature,
    })
  }

  private finishTrack(): void {
    const track = this.track
    this.track = undefined
    if (track === undefined) return
    const built = buildUnit(track, this.creator, this.activityType)
    this.units.push(built.unit)
    this.dropped += built.dropped
  }
}

function newTrack(): OpenTrack {
  return {
    type: undefined,
    typeSeen: false,
    name: undefined,
    nameSeen: false,
    anyPosition: false,
    points: [],
    untimed: 0,
  }
}

/**
 * Whether a unit holds nothing to read and nothing that is refused for its sport, so that the file is
 * empty. A refused sport is reported as the sport, even when the track has no points.
 */
function readsAsEmpty(unit: PipelineUnit): boolean {
  return unit.records.length === 0 && (unit.sport !== null || unit.refusal?.code === 'no-sport')
}

/**
 * Sorts one track's points by time, drops repeated times, and maps the points to pipeline records.
 * A track with no sport is refused by the pipeline, so its speeds are only placeholders.
 */
function buildUnit(
  track: OpenTrack,
  creator: string | undefined,
  activityType: string | undefined,
): { unit: PipelineUnit; dropped: number } {
  // Array.prototype.sort is stable, so the first of several equal times is the one kept.
  const sorted = track.points.sort((a, b) => a.tMs - b.tMs)
  let dropped = track.untimed
  const ordered: Point[] = []
  for (const point of sorted) {
    if (ordered.at(-1)?.tMs === point.tMs) dropped++
    else ordered.push(point)
  }

  const choice = sportOfType(track.type, creator, activityType)
  const motion = recordsOf(ordered, MAX_SPEED_MPS[choice.sport ?? 'ride'])
  dropped += motion.rejected
  const unit: PipelineUnit = {
    records: motion.records,
    ...(choice.sport !== null && ordered.some((point) => point.cadence !== undefined)
      ? { cadenceUnit: SPORT_TRACE[choice.sport].gpxCadenceUnit }
      : {}),
    timerEvents: [],
    sport: choice.sport,
    sportLabel: choice.sportLabel,
    sportFromList: choice.fromList,
    indoor: choice.indoor,
    hasPosition: track.anyPosition,
    refusal: choice.refusal,
    fixes: fixesOf(ordered),
    title: fileTitle(track.name),
  }
  return { unit, dropped }
}

/** The trimmed text, or undefined when it is blank. */
function nonBlank(text: string): string | undefined {
  const trimmed = text.trim()
  return trimmed === '' ? undefined : trimmed
}
