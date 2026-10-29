/**
 * The arithmetic behind the aligned time-series stack: one stream reduced to a column per pixel, with a
 * rolling mean for the line and the lowest and highest reading for the band, the paths drawn from those
 * columns, and the cursor's steps. It knows nothing of activities, so it is tested on plain arrays.
 */

/** The plot's left and right margins in px. The lap strip and the brush take the same, so they line up. */
export const STACK_MARGIN = { left: 44, right: 12 }

/** The shortest rolling mean, in seconds: a close view still averages out a second's jitter. */
const MIN_WINDOW_S = 3
/** The rolling mean is this fraction of the window: a trend at overview, and detail once zoomed. */
const WINDOW_SPAN_SHARE = 1 / 175

/**
 * The most seconds with no reading that a line is drawn across, as the sample rate of the recorders: a
 * second or two missing is a hiccup and is bridged; a longer stretch is a gap, and the line breaks.
 */
export const BRIDGED_GAP_S = 2

/** A stream with its running sums, so that the mean of any window is two lookups, however long the ride. */
export interface SmoothedStream {
  /** One value a second; NaN where there is no reading to plot. */
  values: Float32Array
  /** sum[i] is the total of the readings before second i, and count[i] how many there were. */
  sum: Float64Array
  count: Int32Array
}

/** Running sums of the stream, made once and reused at every zoom. */
export function smoothedStream(values: Float32Array): SmoothedStream {
  const sum = new Float64Array(values.length + 1)
  const count = new Int32Array(values.length + 1)
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i]!
    const finite = Number.isFinite(value)
    sum[i + 1] = sum[i]! + (finite ? value : 0)
    count[i + 1] = count[i]! + (finite ? 1 : 0)
  }
  return { values, sum, count }
}

/** One column per pixel of a window: where it is, its smoothed value, and the spread of its readings. */
export interface SeriesColumns {
  /** Each column's centre, in seconds from the start of the activity. */
  x: number[]
  /** The rolling mean around the centre, or NaN where no reading lies in the window. */
  mean: number[]
  /**
   * The spread of the readings inside the column, the 10th and 90th percentile, or NaN where it holds none. A
   * few stray readings do not set it, so the band stays a spread and not the whole row. With fewer than ten
   * readings these are the lowest and highest.
   */
  lo: number[]
  hi: number[]
  /** The rolling mean's width, in seconds. */
  windowS: number
}

/**
 * The rolling mean's width for a window of `spanS` seconds: a hundred and seventy-fifth of it, so a six-hour
 * ride reads as a trend (two minutes) and a lap of five minutes shows its detail (3 s, the least), never
 * more than the window itself.
 */
export function smoothingWindowS(spanS: number): number {
  return Math.max(1, Math.min(spanS, Math.max(MIN_WINDOW_S, Math.round(spanS * WINDOW_SPAN_SHARE))))
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

/**
 * The mean of the `windowS` seconds centred on `centre`, cut short at the ends of the stream and of the view
 * (`from` to `to`), or NaN with no reading in it. A window past an end is cut there, not slid inward, so the mean
 * there stays about its own centre, and a lap's first seconds are not averaged with the seconds before it.
 */
function windowMean(
  stream: SmoothedStream,
  centre: number,
  windowS: number,
  from = 0,
  to = stream.values.length,
): number {
  const length = stream.values.length
  const start = Math.round(centre - windowS / 2)
  const i0 = clamp(start, clamp(from, 0, length), length)
  const i1 = clamp(start + windowS, 0, clamp(to, 0, length))
  const seen = stream.count[i1]! - stream.count[i0]!
  return seen > 0 ? (stream.sum[i1]! - stream.sum[i0]!) / seen : Number.NaN
}

/** Whether a reading lies within `radius` seconds either side of [first, last): the stretch is no gap if so. */
function bridged(stream: SmoothedStream, first: number, last: number, radius: number): boolean {
  const length = stream.values.length
  const before =
    stream.count[clamp(first, 0, length)]! - stream.count[clamp(first - radius, 0, length)]!
  const after =
    stream.count[clamp(last + radius, 0, length)]! - stream.count[clamp(last, 0, length)]!
  return before > 0 && after > 0 && last - first <= radius
}

/** Whether second t has a reading, or one within the bridged gap either side: the cursor reads nothing in a real gap. */
export function hasReadingNear(stream: SmoothedStream, second: number): boolean {
  return (
    Number.isFinite(stream.values[second] ?? Number.NaN) ||
    bridged(stream, second, second + 1, BRIDGED_GAP_S)
  )
}

/** A rolling mean's width in words: whole minutes from a minute, else seconds. */
export function windowText(seconds: number): string {
  return seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds} s`
}

/** The share of a column's readings cut from each end of its band. */
const BAND_CUT = 0.1

/**
 * The stream over [startS, endS) as at most `columns` columns. With `ignoreZero` the band leaves out zero
 * readings (a power meter's coasting seconds), unless the column holds nothing else; the line's mean keeps them.
 */
export function reduceSeries(
  stream: SmoothedStream,
  startS: number,
  endS: number,
  columns: number,
  ignoreZero = false,
): SeriesColumns {
  const length = stream.values.length
  const from = Math.max(0, Math.floor(startS))
  const to = Math.min(length, Math.ceil(endS))
  const span = Math.max(1, to - from)
  const count = Math.max(1, Math.min(Math.floor(columns), span))
  const windowS = smoothingWindowS(span)
  const out: SeriesColumns = { x: [], mean: [], lo: [], hi: [], windowS }
  const scratch = new Float64Array(Math.ceil(span / count) + 2)
  for (let k = 0; k < count; k += 1) {
    const first = from + Math.floor((k * span) / count)
    const last = Math.max(first + 1, from + Math.floor(((k + 1) * span) / count))
    let seen = 0
    let positive = 0
    for (let i = first; i < last; i += 1) {
      const value = stream.values[i]!
      if (!Number.isFinite(value)) continue
      scratch[seen] = value
      seen += 1
      if (value !== 0) positive += 1
    }
    let readings = scratch.subarray(0, seen)
    readings.sort()
    // Coasting is not the spread of the effort: leave its zeros out of the band, where the column has other readings.
    if (ignoreZero && positive > 0 && positive < seen) readings = readings.subarray(seen - positive)
    const centre = (first + last) / 2
    // A column with no reading in it is on the line only across a gap of a second or two; a longer one breaks it.
    const gap = seen === 0 && !bridged(stream, first, last, BRIDGED_GAP_S)
    out.x.push(centre)
    out.mean.push(gap ? Number.NaN : windowMean(stream, centre, windowS, from, to))
    const n = readings.length
    out.lo.push(n === 0 ? Number.NaN : readings[Math.floor(n * BAND_CUT)]!)
    out.hi.push(n === 0 ? Number.NaN : readings[Math.max(0, Math.ceil(n * (1 - BAND_CUT)) - 1)]!)
  }
  return out
}

/** The mean of the window around second t, or NaN with no reading in it. */
export function meanAround(
  stream: SmoothedStream,
  t: number,
  windowS: number,
  from?: number,
  to?: number,
): number {
  return windowMean(stream, t + 0.5, windowS, from, to)
}

/**
 * How a channel's readings are spread over its row. A pace is read in minutes a kilometre, so it is drawn
 * evenly in pace (a minute is the same height anywhere on the axis) and faster is up; every other measure is
 * drawn evenly in its own unit. The readings stay in the channel's own unit, speed for a pace.
 */
export type AxisScale = 'linear' | 'pace'

/** The least speed a pace is projected from, m/s, so a pace of no speed is a long one and never infinite. */
const LEAST_SPEED = 0.01

/** A reading's place along its axis: rising with the reading, and for a pace rising as the pace gets faster. */
export function projectReading(scale: AxisScale | undefined, value: number): number {
  return scale === 'pace' ? -1 / Math.max(value, LEAST_SPEED) : value
}

/** How far up an axis from `low` to `high` a reading sits: 0 at the bottom, 1 at the top, past them for a reading off the axis. */
export function axisPosition(
  scale: AxisScale | undefined,
  low: number,
  high: number,
  value: number,
): number {
  const base = projectReading(scale, low)
  const span = projectReading(scale, high) - base || 1
  return (projectReading(scale, value) - base) / span
}

/** The share of the way up an axis that a reading sits, held to the axis's ends. */
export function axisShare(
  scale: AxisScale | undefined,
  low: number,
  high: number,
  value: number,
): number {
  return Math.min(1, Math.max(0, axisPosition(scale, low, high, value)))
}

/** Maps seconds and values to pixels. The value scale is clamped to the row, so a reading past the axis sits on its edge. */
export interface PixelMap {
  x: (timeS: number) => number
  y: (value: number) => number
}

const fixed = (value: number) => Number(value.toFixed(1))

/** Runs of consecutive columns with a value, as [first, last] index pairs. */
function runsOf(values: readonly number[]): [number, number][] {
  const runs: [number, number][] = []
  let first = -1
  for (let i = 0; i <= values.length; i += 1) {
    const here = i < values.length && Number.isFinite(values[i]!)
    if (here && first < 0) first = i
    if (!here && first >= 0) {
      runs.push([first, i - 1])
      first = -1
    }
  }
  return runs
}

/** The smoothed line, broken where columns have no reading. A lone column is a zero-length stroke, drawn as a dot by the round cap. */
export function linePath(columns: SeriesColumns, map: PixelMap): string {
  return runsOf(columns.mean)
    .map(([first, last]) => {
      const points: string[] = []
      for (let i = first; i <= last; i += 1) {
        const at = `${fixed(map.x(columns.x[i]!))} ${fixed(map.y(columns.mean[i]!))}`
        points.push(`${i === first ? 'M' : 'L'} ${at}`)
      }
      if (first === last) points.push(points[0]!.replace('M', 'L'))
      return points.join(' ')
    })
    .join(' ')
}

/** The band between the lowest and highest reading of each column, one closed shape for each unbroken stretch. */
export function bandPath(columns: SeriesColumns, map: PixelMap): string {
  const bounded = columns.lo.map((lo, i) =>
    Number.isFinite(lo) && Number.isFinite(columns.hi[i]!) ? lo : Number.NaN,
  )
  return runsOf(bounded)
    .map(([first, last]) => {
      const top: string[] = []
      const bottom: string[] = []
      for (let i = first; i <= last; i += 1) {
        const x = fixed(map.x(columns.x[i]!))
        top.push(`${x} ${fixed(map.y(columns.hi[i]!))}`)
        bottom.push(`${x} ${fixed(map.y(columns.lo[i]!))}`)
      }
      return `M ${top.join(' L ')} L ${bottom.reverse().join(' L ')} Z`
    })
    .join(' ')
}

/** The area under the smoothed line down to `baseline`, one closed shape for each unbroken stretch. */
export function areaPath(columns: SeriesColumns, map: PixelMap, baseline: number): string {
  return runsOf(columns.mean)
    .map(([first, last]) => {
      const points: string[] = []
      for (let i = first; i <= last; i += 1) {
        points.push(`${fixed(map.x(columns.x[i]!))} ${fixed(map.y(columns.mean[i]!))}`)
      }
      const left = fixed(map.x(columns.x[first]!))
      const right = fixed(map.x(columns.x[last]!))
      return `M ${left} ${fixed(baseline)} L ${points.join(' L ')} L ${right} ${fixed(baseline)} Z`
    })
    .join(' ')
}

/** Times a tick may fall on, in seconds: whole minutes and hours read, and so do round fractions of them. */
const TIME_STEPS_S = [
  1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 21600, 43200,
]

/** The ticks of a time axis over [startS, endS]: round times, no closer than `minGapPx` on a plot `widthPx` wide. */
export function timeTicks(
  startS: number,
  endS: number,
  widthPx: number,
  minGapPx: number,
): number[] {
  const span = Math.max(1, endS - startS)
  const wanted = Math.max(1, Math.floor(widthPx / minGapPx))
  const step = TIME_STEPS_S.find((candidate) => span / candidate <= wanted) ?? TIME_STEPS_S.at(-1)!
  const ticks: number[] = []
  for (let t = Math.ceil(startS / step) * step; t <= endS; t += step) ticks.push(t)
  return ticks
}

/** Keys the cursor answers to: the plot surface's navigation keys. */
export type CursorKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End' | 'Escape'

/** How many presses of an arrow cross the window, so a long window is crossed as quickly as a short one. */
const PRESSES_ACROSS = 100

/**
 * Where the cursor goes for a key, in whole seconds inside [startS, endS - 1]. An arrow moves it by
 * about a hundredth of the window (a second at least) and starts from the ends; Home and End jump to them;
 * Escape clears it.
 */
export function stepCursor(
  cursor: number | null,
  key: CursorKey,
  startS: number,
  endS: number,
): number | null {
  const last = Math.max(startS, endS - 1)
  if (key === 'Escape') return null
  if (key === 'Home') return startS
  if (key === 'End') return last
  const step = Math.max(1, Math.round((endS - startS) / PRESSES_ACROSS))
  if (cursor === null) return key === 'ArrowRight' ? startS : last
  return Math.max(startS, Math.min(last, cursor + (key === 'ArrowRight' ? step : -step)))
}
