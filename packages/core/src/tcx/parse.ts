import type { RawRecord } from '../fit/resample'
import type { GpsTrack } from '../import/gps'
import { activitiesFromUnits, MAX_SPEED_MPS } from '../import/pipeline'
import type { PipelineUnit } from '../import/pipeline'
import type { ParseLimits, ParseOptions, ParseResult } from '../import/result'
import { DEFAULT_PARSE_LIMITS, failure, NO_RECORDS } from '../import/result'
import { parseIsoTime, ZONELESS } from '../import/time'
import {
  fixesOf,
  hasUsablePosition,
  readNonNegative,
  readNumber,
  readPosition,
  Refusal,
  trackFromPoints,
} from '../import/trackpoints'
import { sortAndDedupe } from './points'
import type { Point } from './points'
import { isEBikeType, sportOfType } from '../import/sportType'
import type { SportChoice } from '../import/sportType'
import type { Sport } from '../types'
import { scanXmlBytes } from '../xml/parse'
import type { XmlHandler } from '../xml/parse'
import { recordedDistance, speedFromDistance } from './distance'

const NOT_TCX = 'Not a TCX file'
const DECODE_FAILED = 'Could not decode TCX file'
const NO_ACTIVITIES = 'File contains no activities'
const NO_ZONE = 'TCX times need a time zone (Z or ±hh:mm)'

/** The values read from one Trackpoint, as text. Each element is taken once, the first one. */
type Field =
  | 'time'
  | 'lat'
  | 'lon'
  | 'distance'
  | 'altitude'
  | 'heartRate'
  | 'power'
  | 'speed'
  | 'cadence'
  | 'runCadence'
  | 'temperature'
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
  // The TCX Cadence element is cycling rpm; RunCadence is already running steps/min.
  ['Cadence', 'cadence'],
  ['Extensions/TPX/RunCadence', 'runCadence'],
  ['Extensions/TPX/Temp', 'temperature'],
])

/** One Activity while its Laps stream past. */
interface OpenActivity extends SportChoice {
  points: Point[]
  laps: NonNullable<PipelineUnit['laps']>
  openLap?: OpenLap
  lapCount: number
}

interface OpenLap {
  pointStart: number
  startMs?: number
  totalTimeS?: number
}

/** The text of the value element being read, until it closes. */
interface OpenField {
  field: Field
  depth: number
  text: string
}

interface OpenLapField {
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
  scanXmlBytes(bytes, new TcxScanner(units, limits.maxRecordMessages, opts.activityType))
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
  /** The type the export's list gives the activity, for an Activity whose Sport is Other. */
  private readonly activityType: string | undefined
  private trackpoints = 0
  private activity: OpenActivity | undefined
  private trackpoint: RawTrackpoint | undefined
  private field: OpenField | undefined
  private lapField: OpenLapField | undefined

  constructor(units: PipelineUnit[], maxTrackpoints: number, activityType: string | undefined) {
    this.units = units
    this.maxTrackpoints = maxTrackpoints
    this.activityType = activityType
  }

  open(local: string, _name: string, attrs: Record<string, string>, depth: number): void {
    this.stack.push(local)
    if (depth === 1) {
      if (local !== 'TrainingCenterDatabase') throw new Refusal(NOT_TCX, 'corrupt')
    } else if (depth === 3 && local === 'Activity' && this.stack[1] === 'Activities') {
      this.activity = openActivity(attrs.Sport, this.activityType)
    } else if (depth === 4 && local === 'Lap' && this.activity !== undefined) {
      const startMs =
        attrs.StartTime === undefined ? undefined : parseIsoTime(attrs.StartTime, 'refuse')
      this.activity.openLap = {
        pointStart: this.activity.points.length,
        ...(typeof startMs === 'number' ? { startMs } : {}),
      }
      this.activity.lapCount++
    } else if (
      depth === 5 &&
      local === 'TotalTimeSeconds' &&
      this.activity?.openLap !== undefined
    ) {
      this.lapField = { depth, text: '' }
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
    else if (this.lapField?.depth === depth) this.lapField.text += text
  }

  close(_local: string, _name: string, depth: number): void {
    const lapField = this.lapField
    if (lapField !== undefined && lapField.depth === depth) {
      this.lapField = undefined
      const duration = readNonNegative(lapField.text)
      if (duration !== undefined && this.activity?.openLap !== undefined) {
        this.activity.openLap.totalTimeS = duration
      }
    }
    const field = this.field
    if (field !== undefined && field.depth === depth) {
      this.field = undefined
      if (this.trackpoint !== undefined) this.trackpoint[field.field] = field.text
    }
    if (depth === 6 && this.trackpoint !== undefined) this.closeTrackpoint()
    else if (depth === 4 && this.activity?.openLap !== undefined) this.closeLap()
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

  private closeLap(): void {
    const activity = this.activity
    const lap = activity?.openLap
    if (activity === undefined || lap === undefined) return
    const points = activity.points.slice(lap.pointStart)
    activity.openLap = undefined
    if (points.length === 0) return
    let firstPointMs = Infinity
    let lastMs = -Infinity
    for (const point of points) {
      firstPointMs = Math.min(firstPointMs, point.tMs)
      lastMs = Math.max(lastMs, point.tMs)
    }
    const startMs = lap.startMs ?? firstPointMs
    const endMs = lap.totalTimeS === undefined ? lastMs + 1000 : startMs + lap.totalTimeS * 1000
    if (endMs > startMs) {
      activity.laps.push({ startMs, endMs, label: `Lap ${activity.lapCount}` })
    }
  }
}

/**
 * The sport is the Sport attribute's, unless that is Other or missing and the export's list says what
 * the activity was. A list that says e-bike refuses the activity whatever its Sport.
 */
function openActivity(sportName: string | undefined, listed: string | undefined): OpenActivity {
  const sport = sportOf(sportName)
  const unsaid = sport === null && (sportName === undefined || sportName === 'Other')
  if (listed !== undefined && (unsaid || isEBikeType(listed))) {
    return { ...sportOfType(undefined, undefined, listed), points: [], laps: [], lapCount: 0 }
  }
  return {
    sport,
    indoor: false,
    sportLabel: sportName ?? 'unknown',
    points: [],
    laps: [],
    lapCount: 0,
  }
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
    cadence: readNonNegative(raw.cadence),
    runCadence: readNonNegative(raw.runCadence),
    temperature: readNumber(raw.temperature),
  }
}

/** Maps one Activity to the shared pipeline's input. */
function unitOf(activity: OpenActivity): PipelineUnit {
  const { sport, sportLabel, fromList, refusal } = activity
  if (sport === null) {
    return {
      records: [],
      laps: [],
      timerEvents: [],
      sport,
      sportLabel,
      sportFromList: fromList,
      refusal,
      indoor: false,
      hasPosition: false,
    }
  }
  const points = sortAndDedupe(activity.points)
  const hasPosition = points.some((p) => hasUsablePosition(p.position))
  const hasCadence = points.some((point) =>
    sport === 'run' ? point.runCadence !== undefined : point.cadence !== undefined,
  )
  return {
    records: recordsOf(points, sport),
    laps: activity.laps,
    ...(hasCadence ? { cadenceUnit: sport === 'run' ? 'steps/min' : 'rev/min' } : {}),
    timerEvents: [],
    sport,
    sportLabel,
    // A trainer ride saved as plain cycling has no positions at all.
    indoor: activity.indoor || (sport === 'ride' && !hasPosition),
    hasPosition,
    fixes: fixesOf(points),
  }
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
    cadence: sport === 'run' ? p.runCadence : p.cadence,
    temperature: p.temperature,
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
