/**
 * The arithmetic behind the aligned time-series stack: one stream reduced to a column per pixel, with a
 * rolling mean for the line and the lowest and highest reading for the band, the paths drawn from those
 * columns, and the cursor's steps. It knows nothing of activities, so it is tested on plain arrays.
 */

/** The plot's left and right margins in px. The lap strip and the brush take the same, so they line up. */
export const STACK_MARGIN = { left: 44, right: 12 }

/** The shortest and longest rolling mean, in seconds. */
const MIN_WINDOW_S = 3
const MAX_WINDOW_S = 60

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

/** One column per pixel of a window: where it is, its smoothed value, and its lowest and highest reading. */
export interface SeriesColumns {
  /** Each column's centre, in seconds from the start of the activity. */
  x: number[]
  /** The rolling mean around the centre, or NaN where no reading lies in the window. */
  mean: number[]
  /** The lowest and highest reading inside the column, or NaN where it holds none. */
  lo: number[]
  hi: number[]
  /** The rolling mean's width, in seconds. */
  windowS: number
}

/**
 * The rolling mean's width for a window drawn over `columns` pixels: twice a pixel's seconds, so a
 * wider view smooths more and a close one shows nearly each reading, within 3 to 60 s.
 */
export function smoothingWindowS(spanS: number, columns: number): number {
  const raw = Math.round((2 * spanS) / Math.max(1, columns))
  return Math.max(1, Math.min(spanS, Math.max(MIN_WINDOW_S, Math.min(MAX_WINDOW_S, raw))))
}

/** The stream over [startS, endS) as at most `columns` columns, in one pass over the seconds it spans. */
export function reduceSeries(
  stream: SmoothedStream,
  startS: number,
  endS: number,
  columns: number,
): SeriesColumns {
  const length = stream.values.length
  const from = Math.max(0, Math.floor(startS))
  const to = Math.min(length, Math.ceil(endS))
  const span = Math.max(1, to - from)
  const count = Math.max(1, Math.min(Math.floor(columns), span))
  const windowS = smoothingWindowS(span, count)
  const out: SeriesColumns = { x: [], mean: [], lo: [], hi: [], windowS }
  for (let k = 0; k < count; k += 1) {
    const first = from + Math.floor((k * span) / count)
    const last = Math.max(first + 1, from + Math.floor(((k + 1) * span) / count))
    let lo = Infinity
    let hi = -Infinity
    for (let i = first; i < last; i += 1) {
      const value = stream.values[i]!
      if (!Number.isFinite(value)) continue
      if (value < lo) lo = value
      if (value > hi) hi = value
    }
    const centre = (first + last) / 2
    const i0 = Math.max(0, Math.min(length, Math.round(centre - windowS / 2)))
    const i1 = Math.max(i0, Math.min(length, i0 + windowS))
    const seen = stream.count[i1]! - stream.count[i0]!
    out.x.push(centre)
    out.mean.push(seen > 0 ? (stream.sum[i1]! - stream.sum[i0]!) / seen : Number.NaN)
    out.lo.push(lo === Infinity ? Number.NaN : lo)
    out.hi.push(hi === -Infinity ? Number.NaN : hi)
  }
  return out
}

/** The mean of the window around second t, or NaN with no reading in it. */
export function meanAround(stream: SmoothedStream, t: number, windowS: number): number {
  const length = stream.values.length
  const i0 = Math.max(0, Math.min(length, Math.round(t + 0.5 - windowS / 2)))
  const i1 = Math.max(i0, Math.min(length, i0 + windowS))
  const seen = stream.count[i1]! - stream.count[i0]!
  return seen > 0 ? (stream.sum[i1]! - stream.sum[i0]!) / seen : Number.NaN
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
