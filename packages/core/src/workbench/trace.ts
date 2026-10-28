import type { Activity } from '../types'
import { isSport } from './sportTrace'
import type { ActivityLap, ActivityTrace, TraceMetric } from './types'

export const MAX_TRACE_DURATION_S = 48 * 60 * 60

const METRICS: readonly TraceMetric[] = [
  'speed',
  'heartRate',
  'power',
  'cadence',
  'altitude',
  'temperature',
]

/** A detail trace built from recorded activity streams, without derived virtual power. */
export function activityTraceOf(activity: Activity): ActivityTrace {
  const n = activity.n
  const streams: Partial<Record<TraceMetric, Float32Array>> = {
    // With neither speed nor distance recorded the speed is a synthesized zero, which is not data.
    ...(activity.hasMotion === false ? {} : { speed: Float32Array.from(activity.speed) }),
    ...(activity.hasHeartRate ? { heartRate: Float32Array.from(activity.heartRate) } : {}),
    ...(activity.hasAltitude ? { altitude: Float32Array.from(activity.altitude) } : {}),
    ...(activity.hasPower ? { power: Float32Array.from(activity.power) } : {}),
    ...(activity.cadence === undefined ? {} : { cadence: activity.cadence.slice() }),
    ...(activity.temperature === undefined ? {} : { temperature: activity.temperature.slice() }),
  }
  return {
    version: 1,
    activityId: activity.id,
    sport: activity.sport,
    ...(activity.cadence === undefined || activity.cadenceUnit === undefined
      ? {}
      : { cadenceUnit: activity.cadenceUnit }),
    durationS: n,
    distance:
      activity.hasMotion === false ? new Float64Array(n).fill(NaN) : activity.distance.slice(),
    paused: activity.paused.slice(),
    unrecorded: activity.unrecorded?.slice() ?? new Uint8Array(n),
    streams,
    laps: normalizeLaps(activity.laps ?? [], n),
  }
}

/** Validates a worker/storage value before it is used as activity evidence. */
export function parseActivityTrace(value: unknown): ActivityTrace | null {
  if (!isObject(value)) return null
  const {
    version,
    activityId,
    sport,
    cadenceUnit,
    durationS,
    distance,
    paused,
    unrecorded,
    streams,
    laps,
  } = value
  if (
    version !== 1 ||
    typeof activityId !== 'string' ||
    activityId.length === 0 ||
    !isSport(sport) ||
    !Number.isInteger(durationS) ||
    (durationS as number) < 0 ||
    (durationS as number) > MAX_TRACE_DURATION_S ||
    !(distance instanceof Float64Array) ||
    distance.length !== durationS ||
    !(paused instanceof Uint8Array) ||
    paused.length !== durationS ||
    !(unrecorded instanceof Uint8Array) ||
    unrecorded.length !== durationS ||
    !isObject(streams) ||
    !Array.isArray(laps)
  ) {
    return null
  }
  if (
    cadenceUnit !== undefined &&
    cadenceUnit !== 'steps/min' &&
    cadenceUnit !== 'rev/min' &&
    cadenceUnit !== 'unknown'
  )
    return null
  if (cadenceUnit !== undefined && streams.cadence === undefined) return null
  if (!validMask(paused) || !validMask(unrecorded) || !validDistance(distance)) return null

  const cleanStreams: Partial<Record<TraceMetric, Float32Array>> = {}
  for (const key of Object.keys(streams)) {
    if (!METRICS.includes(key as TraceMetric)) return null
  }
  for (const metric of METRICS) {
    const stream = streams[metric]
    if (stream === undefined) continue
    if (!(stream instanceof Float32Array) || stream.length !== durationS || !noInfinity(stream)) {
      return null
    }
    cleanStreams[metric] = stream.slice()
  }
  const cleanLaps = parseLaps(laps, durationS as number)
  if (cleanLaps === null) return null
  return {
    version: 1,
    activityId,
    sport,
    ...(cadenceUnit === undefined ? {} : { cadenceUnit }),
    durationS: durationS as number,
    distance: distance.slice(),
    paused: paused.slice(),
    unrecorded: unrecorded.slice(),
    streams: cleanStreams,
    laps: cleanLaps,
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validMask(mask: Uint8Array): boolean {
  for (const value of mask) if (value !== 0 && value !== 1) return false
  return true
}

function validDistance(distance: Float64Array): boolean {
  let previous = -Infinity
  for (const value of distance) {
    if (Number.isNaN(value)) continue
    if (!Number.isFinite(value) || value < 0 || value < previous) return false
    previous = value
  }
  return true
}

function noInfinity(stream: Float32Array): boolean {
  for (const value of stream) if (!Number.isNaN(value) && !Number.isFinite(value)) return false
  return true
}

function parseLaps(value: unknown[], durationS: number): ActivityLap[] | null {
  const laps: ActivityLap[] = []
  let previousEnd = 0
  for (const item of value) {
    if (!isObject(item)) return null
    const { startS, endS, label } = item
    if (
      !Number.isInteger(startS) ||
      !Number.isInteger(endS) ||
      (startS as number) < previousEnd ||
      (endS as number) <= (startS as number) ||
      (endS as number) > durationS ||
      (label !== undefined && typeof label !== 'string')
    ) {
      return null
    }
    laps.push({ startS: startS as number, endS: endS as number, ...(label ? { label } : {}) })
    previousEnd = endS as number
  }
  return laps
}

function normalizeLaps(laps: ActivityLap[], durationS: number): ActivityLap[] {
  const sorted = laps
    .filter(
      (lap) =>
        Number.isFinite(lap.startS) &&
        Number.isFinite(lap.endS) &&
        Number.isInteger(lap.startS) &&
        Number.isInteger(lap.endS),
    )
    .map((lap) =>
      Object.assign({}, lap, {
        startS: Math.max(0, Math.min(durationS, lap.startS)),
        endS: Math.max(0, Math.min(durationS, lap.endS)),
      }),
    )
    .filter((lap) => lap.endS > lap.startS)
    .sort((a, b) => a.startS - b.startS || a.endS - b.endS)
  const out: ActivityLap[] = []
  let previousEnd = 0
  for (const lap of sorted) {
    const startS = Math.max(previousEnd, lap.startS)
    if (lap.endS <= startS) continue
    out.push({ ...lap, startS })
    previousEnd = lap.endS
  }
  return out
}
