/** Longest gap, in seconds, bridged by interpolation. Longer gaps are treated as pauses or dropouts. */
const MAX_INTERPOLATED_GAP_S = 10

/** Records further than this from the median timestamp are treated as clock errors. */
const STRAY_TIMESTAMP_MS = 24 * 60 * 60 * 1000

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
  /** 1 inside a gap longer than 10 s in which no record of any kind exists, else 0. */
  paused: Uint8Array
  hasPower: boolean
  hasHeartRate: boolean
  hasAltitude: boolean
}

export function resample(records: RawRecord[]): Resampled {
  const sorted = withinDayOfMedian(records.filter((r) => Number.isFinite(r.tMs)))
  const first = sorted[0]
  if (first === undefined) return emptyResample()

  const startMs = first.tMs
  const indexOf = (r: RawRecord): number => Math.round((r.tMs - startMs) / 1000)
  let n = 0
  for (const r of sorted) n = Math.max(n, indexOf(r) + 1)

  const speedKnown = new Float64Array(n).fill(NaN)
  const distanceKnown = new Float64Array(n).fill(NaN)
  const altitudeKnown = new Float64Array(n).fill(NaN)
  const heartRateKnown = new Float64Array(n).fill(NaN)
  const powerKnown = new Float64Array(n).fill(NaN)
  const recorded = new Uint8Array(n)
  for (const r of sorted) {
    const i = indexOf(r)
    recorded[i] = 1
    put(speedKnown, i, r.speed)
    put(distanceKnown, i, r.distance)
    put(altitudeKnown, i, r.altitude)
    put(heartRateKnown, i, r.heartRate)
    put(powerKnown, i, r.power)
  }
  const paused = markPauses(recorded)

  const hasSpeed = speedKnown.some(isFiniteValue)
  const hasDistance = distanceKnown.some(isFiniteValue)
  const hasAltitude = altitudeKnown.some(isFiniteValue)
  const hasHeartRate = heartRateKnown.some(isPositiveValue)
  const hasPower = powerKnown.some(isPositiveValue)

  const altitude = hasAltitude
    ? fillStream(altitudeKnown, 'interpolate', 'interpolate', 'nearest', paused)
    : new Float64Array(n).fill(NaN)
  const heartRate = hasHeartRate
    ? fillStream(heartRateKnown, NaN, NaN, NaN, paused)
    : new Float64Array(n).fill(NaN)
  const power = hasPower ? fillStream(powerKnown, 0, NaN, 0, paused) : new Float64Array(n).fill(NaN)

  let speed = fillStream(speedKnown, 0, NaN, 0, paused)
  let distance: Float64Array
  if (hasDistance) {
    distance = fillStream(distanceKnown, 'hold', 'hold', 'nearest', paused)
  } else {
    distance = integrate(speed)
  }
  enforceNonDecreasing(distance)
  if (!hasSpeed && hasDistance) speed = speedFromDistance(distance)

  return {
    startMs,
    n,
    speed,
    distance,
    altitude,
    heartRate,
    power,
    paused,
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
    hasPower: false,
    hasHeartRate: false,
    hasAltitude: false,
  }
}

/** Sorts by time and drops records that sit more than a day from the median timestamp. */
function withinDayOfMedian(records: RawRecord[]): RawRecord[] {
  const sorted = records.sort((a, b) => a.tMs - b.tMs)
  const median = sorted[Math.floor(sorted.length / 2)]
  if (median === undefined) return sorted
  return sorted.filter((r) => Math.abs(r.tMs - median.tMs) <= STRAY_TIMESTAMP_MS)
}

/** Stores a value at grid index i. Later records overwrite earlier ones; missing values do not. */
function put(dst: Float64Array, i: number, value: number | undefined): void {
  if (value !== undefined && Number.isFinite(value)) dst[i] = value
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

function isFiniteValue(value: number): boolean {
  return Number.isFinite(value)
}

function isPositiveValue(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

/**
 * Fills every index of a stream from its known samples (NaN marks unknown). A gap of at most
 * MAX_INTERPOLATED_GAP_S is interpolated. A longer gap uses `pausedFill` where no record exists
 * and `dropoutFill` where records exist but this stream is missing. With no known samples the
 * result is the edge constant everywhere (speed uses this for a stream that was never recorded).
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
        span <= MAX_INTERPOLATED_GAP_S ? 'interpolate' : paused[i] === 1 ? pausedFill : dropoutFill
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
