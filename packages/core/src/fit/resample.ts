/** Longest gap, in seconds, bridged by interpolation. Longer gaps are treated as pauses or dropouts. */
export const MAX_INTERPOLATED_GAP_S = 10
export const MAX_ACTIVITY_GRID_SECONDS = 7 * 24 * 60 * 60

/**
 * How the samples inside a long gap are filled: linear, held at the earlier sample, or a constant.
 * Paused and dropout gaps can be filled differently.
 */
type GapFill = 'interpolate' | 'hold' | number

/** Value before the first and after the last known sample: the nearest known value, or a constant. */
type EdgeFill = 'nearest' | number

export interface RawRecord {
  tMs: number
  speed?: number
  distance?: number
  altitude?: number
  heartRate?: number
  power?: number
  cadence?: number
  temperature?: number
}

export interface RawTimerEvent {
  tMs: number
  eventType: string | number
}

/** Streams on a 1 Hz grid. Index i is i seconds after `startMs`. */
export interface Resampled {
  startMs: number
  n: number
  speed: Float64Array
  distance: Float64Array
  altitude: Float64Array
  heartRate: Float64Array
  power: Float64Array
  /** Recorded cadence, in steps or revolutions per minute; gaps stay NaN. */
  cadence?: Float32Array
  /** Recorded temperature in degrees Celsius; gaps stay NaN. */
  temperature?: Float32Array
  /** 1 while an explicit timer pause is active, or inside a long record gap when events are absent. */
  paused: Uint8Array
  /**
   * 1 inside a record gap of over 10 s that no timer pause covers: the seconds were not recorded, so
   * their time and distance are unknown. Set on every activity, timer events or not.
   */
  unrecorded: Uint8Array
  hasPower: boolean
  hasHeartRate: boolean
  hasAltitude: boolean
}

/**
 * Splits records wherever consecutive records (in time order) are more than `maxGapMs` apart.
 * Each part is one continuous activity, so a long gap is never bridged and no data is dropped.
 */
export function splitAtGaps(records: RawRecord[], maxGapMs = 4 * 3600_000): RawRecord[][] {
  const sorted = sortByTime(records)
  const segments: RawRecord[][] = []
  let current: RawRecord[] = []
  for (const r of sorted) {
    const previous = current.at(-1)
    if (previous !== undefined && r.tMs - previous.tMs > maxGapMs) {
      segments.push(current)
      current = []
    }
    current.push(r)
  }
  if (current.length > 0) segments.push(current)
  return segments
}

/** Resamples one continuous segment (see splitAtGaps) onto a 1 Hz grid. */
export function resample(
  records: RawRecord[],
  timerEvents: RawTimerEvent[] = [],
  maxGridSeconds = MAX_ACTIVITY_GRID_SECONDS,
): Resampled {
  const sorted = sortByTime(records)
  const first = sorted[0]
  if (first === undefined) return emptyResample()

  const startMs = first.tMs
  const indexOf = (r: RawRecord): number => Math.round((r.tMs - startMs) / 1000)
  let n = 0
  for (const r of sorted) n = Math.max(n, indexOf(r) + 1)
  if (n > maxGridSeconds) {
    throw new RangeError(`Activity exceeds the ${maxGridSeconds}-second time-grid limit`)
  }

  const speedKnown = new Float64Array(n).fill(NaN)
  const distanceKnown = new Float64Array(n).fill(NaN)
  const altitudeKnown = new Float64Array(n).fill(NaN)
  const heartRateKnown = new Float64Array(n).fill(NaN)
  const powerKnown = new Float64Array(n).fill(NaN)
  const cadenceKnown = new Float64Array(n).fill(NaN)
  const temperatureKnown = new Float64Array(n).fill(NaN)
  const recorded = new Uint8Array(n)
  for (const r of sorted) {
    const i = indexOf(r)
    recorded[i] = 1
    put(speedKnown, i, r.speed)
    put(distanceKnown, i, r.distance)
    put(altitudeKnown, i, r.altitude)
    put(heartRateKnown, i, r.heartRate)
    put(powerKnown, i, r.power)
    put(cadenceKnown, i, r.cadence)
    put(temperatureKnown, i, r.temperature)
  }
  // FIT timer events distinguish actual pauses from a dropout in the record stream. Older or
  // stripped files may have no timer events, so retain the long-gap heuristic for those files.
  const hasRecognizedTimerEvents = timerEvents.some((event) =>
    normalizeTimerEventType(event.eventType),
  )
  const paused = hasRecognizedTimerEvents
    ? markTimerPauses(recorded, startMs, timerEvents)
    : markPauses(recorded)
  // A gap that a timer pause covers is a real pause, so only the other gaps are unrecorded.
  const gaps = markPauses(recorded)
  const unrecorded = hasRecognizedTimerEvents ? andNot(gaps, paused) : gaps

  const hasSpeed = speedKnown.some(isFiniteValue)
  const hasDistance = distanceKnown.some(isFiniteValue)
  const hasAltitude = altitudeKnown.some(isFiniteValue)
  const hasHeartRate = heartRateKnown.some(isPositiveValue)
  const hasPower = powerKnown.some(isPositiveValue)
  const hasCadence = cadenceKnown.some(isFiniteValue)
  const hasTemperature = temperatureKnown.some(isFiniteValue)

  const altitude = hasAltitude
    ? fillStream(altitudeKnown, 'interpolate', 'interpolate', 'nearest', paused)
    : new Float64Array(n).fill(NaN)
  const heartRate = hasHeartRate
    ? fillStream(heartRateKnown, NaN, NaN, NaN, paused)
    : new Float64Array(n).fill(NaN)
  const power = hasPower
    ? fillStream(powerKnown, 0, NaN, NaN, paused)
    : new Float64Array(n).fill(NaN)

  // A file with no speed at all reads as stationary; otherwise speed is unknown where it was not recorded.
  let speed = hasSpeed ? fillStream(speedKnown, 0, NaN, NaN, paused) : new Float64Array(n)
  let distance: Float64Array
  if (hasDistance) {
    distance = fillStream(distanceKnown, 'hold', 'hold', 'nearest', paused)
  } else {
    distance = integrate(speed)
  }
  enforceNonDecreasing(distance)
  if (!hasSpeed && hasDistance) speed = speedFromDistance(distance)
  for (let i = 0; i < n; i++) {
    if (paused[i] !== 1) continue
    speed[i] = 0
    heartRate[i] = NaN
    if (hasPower) power[i] = 0
  }

  return {
    startMs,
    n,
    speed,
    distance,
    altitude,
    heartRate,
    power,
    ...(hasCadence ? { cadence: Float32Array.from(cadenceKnown) } : {}),
    ...(hasTemperature ? { temperature: Float32Array.from(temperatureKnown) } : {}),
    paused,
    unrecorded,
    hasPower,
    hasHeartRate,
    hasAltitude,
  }
}

function emptyResample(): Resampled {
  return {
    startMs: 0,
    n: 0,
    speed: new Float64Array(0),
    distance: new Float64Array(0),
    altitude: new Float64Array(0),
    heartRate: new Float64Array(0),
    power: new Float64Array(0),
    paused: new Uint8Array(0),
    unrecorded: new Uint8Array(0),
    hasPower: false,
    hasHeartRate: false,
    hasAltitude: false,
  }
}

/** A copy of the records with finite timestamps, in time order. The input is not changed. */
function sortByTime(records: RawRecord[]): RawRecord[] {
  return records.filter((r) => Number.isFinite(r.tMs)).sort((a, b) => a.tMs - b.tMs)
}

/** Stores a value at grid index i. Later records overwrite earlier ones; missing values do not. */
function put(dst: Float64Array, i: number, value: number | undefined): void {
  if (value !== undefined && Number.isFinite(value)) dst[i] = value
}

/** 1 where `a` is 1 and `b` is 0. */
function andNot(a: Uint8Array, b: Uint8Array): Uint8Array {
  return Uint8Array.from(a, (value, i) => (value === 1 && b[i] !== 1 ? 1 : 0))
}

/** Marks every index strictly inside a gap of more than 10 s between records. */
function markPauses(recorded: Uint8Array): Uint8Array {
  const paused = new Uint8Array(recorded.length)
  let previous = -1
  for (let i = 0; i < recorded.length; i++) {
    if (recorded[i] === 0) continue
    if (previous >= 0 && i - previous > MAX_INTERPOLATED_GAP_S) paused.fill(1, previous + 1, i)
    previous = i
  }
  return paused
}

function markTimerPauses(
  recorded: Uint8Array,
  startMs: number,
  events: RawTimerEvent[],
): Uint8Array {
  const paused = new Uint8Array(recorded.length)
  const indexAt = (tMs: number) => Math.round((tMs - startMs) / 1000)
  const ordered = events.filter((event) => Number.isFinite(event.tMs)).sort((a, b) => a.tMs - b.tMs)
  let pauseStart: number | null = null
  for (const event of ordered) {
    const eventType = normalizeTimerEventType(event.eventType)
    if (!eventType) continue
    if (isTimerStop(eventType)) {
      if (pauseStart === null) pauseStart = indexAt(event.tMs)
    } else if (isTimerStart(eventType) && pauseStart !== null) {
      fillRange(paused, pauseStart, indexAt(event.tMs))
      pauseStart = null
    }
  }
  // A stop with no later start lasts only until records resume, so later data is not lost.
  if (pauseStart !== null) {
    fillRange(paused, pauseStart, nextRecordedIndex(recorded, pauseStart + 1))
  }
  return paused
}

/** Sets [from, to) to 1, clipped to the grid. */
function fillRange(values: Uint8Array, from: number, to: number): void {
  const start = Math.max(0, from)
  const end = Math.min(values.length, to)
  if (end > start) values.fill(1, start, end)
}

/** Index of the first recorded second at or after `from`, or the grid length if there is none. */
function nextRecordedIndex(recorded: Uint8Array, from: number): number {
  for (let i = Math.max(0, from); i < recorded.length; i++) {
    if (recorded[i] === 1) return i
  }
  return recorded.length
}

type TimerEventType = 'start' | 'stop' | 'stopAll' | 'stopDisable' | 'stopDisableAll'

function normalizeTimerEventType(eventType: string | number): TimerEventType | null {
  if (
    eventType === 'start' ||
    eventType === 'stop' ||
    eventType === 'stopAll' ||
    eventType === 'stopDisable' ||
    eventType === 'stopDisableAll'
  ) {
    return eventType
  }
  if (eventType === 0) return 'start'
  if (eventType === 1) return 'stop'
  if (eventType === 4) return 'stopAll'
  if (eventType === 8) return 'stopDisable'
  if (eventType === 9) return 'stopDisableAll'
  return null
}

function isTimerStop(eventType: TimerEventType): boolean {
  return (
    eventType === 'stop' ||
    eventType === 'stopAll' ||
    eventType === 'stopDisable' ||
    eventType === 'stopDisableAll'
  )
}

function isTimerStart(eventType: TimerEventType): boolean {
  return eventType === 'start'
}

function isFiniteValue(value: number): boolean {
  return Number.isFinite(value)
}

function isPositiveValue(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

/**
 * Fills every index of a stream from its known samples (NaN marks unknown). A gap of at most
 * MAX_INTERPOLATED_GAP_S is interpolated. A longer gap uses `pausedFill` where no record exists
 * and `dropoutFill` where records exist but this stream is missing. Before the first and after the
 * last known sample the result is `edge`, or the nearest known value when `edge` is 'nearest'.
 */
function fillStream(
  known: Float64Array,
  pausedFill: GapFill,
  dropoutFill: GapFill,
  edge: EdgeFill,
  paused: Uint8Array,
): Float64Array {
  const n = known.length
  const out = new Float64Array(n)
  const samples: number[] = []
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(known[i]!)) samples.push(i)
  }
  const firstIndex = samples[0]
  const lastIndex = samples.at(-1)
  if (firstIndex === undefined || lastIndex === undefined) {
    return out.fill(edge === 'nearest' ? NaN : edge)
  }

  out.fill(edge === 'nearest' ? known[firstIndex]! : edge, 0, firstIndex)
  out.fill(edge === 'nearest' ? known[lastIndex]! : edge, lastIndex + 1)
  out[firstIndex] = known[firstIndex]!

  for (let k = 0; k + 1 < samples.length; k++) {
    const a = samples[k]!
    const b = samples[k + 1]!
    const va = known[a]!
    const vb = known[b]!
    const span = b - a
    out[b] = vb
    for (let i = a + 1; i < b; i++) {
      const gap =
        paused[i] === 1 ? pausedFill : span <= MAX_INTERPOLATED_GAP_S ? 'interpolate' : dropoutFill
      if (gap === 'interpolate') {
        out[i] = va + ((vb - va) * (i - a)) / span
      } else if (gap === 'hold') {
        out[i] = va
      } else {
        out[i] = gap
      }
    }
  }
  return out
}

/** Cumulative sum of speed, one second per sample. Unknown (NaN) speed adds nothing. */
function integrate(speed: Float64Array): Float64Array {
  const out = new Float64Array(speed.length)
  let total = 0
  for (let i = 0; i < speed.length; i++) {
    const v = speed[i]!
    if (Number.isFinite(v)) total += v
    out[i] = total
  }
  return out
}

function enforceNonDecreasing(xs: Float64Array): void {
  let top = -Infinity
  for (let i = 0; i < xs.length; i++) {
    top = Math.max(top, xs[i]!)
    xs[i] = top
  }
}

function speedFromDistance(distance: Float64Array): Float64Array {
  const out = new Float64Array(distance.length)
  for (let i = 1; i < distance.length; i++) {
    out[i] = distance[i]! - distance[i - 1]!
  }
  return out
}
