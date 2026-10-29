import type { Point } from './chartTypes'

const round = (value: number): number => Math.round(value * 10) / 10

/**
 * The slope at each point of a monotone cubic through them (Fritsch and Carlson): the curve never
 * overshoots a data point, so a smoothed line can not rise above a best it never reached. Points must be
 * ascending in x. A run of one point has slope zero.
 */
function slopes(points: readonly Point[]): number[] {
  const n = points.length
  const secants = points.slice(1).map((p, i) => {
    const q = points[i]!
    return p.x === q.x ? 0 : (p.y - q.y) / (p.x - q.x)
  })
  const m = points.map((_, i) => {
    if (i === 0) return secants[0] ?? 0
    if (i === n - 1) return secants[n - 2] ?? 0
    const before = secants[i - 1]!
    const after = secants[i]!
    return before * after <= 0 ? 0 : (before + after) / 2
  })
  secants.forEach((secant, i) => {
    if (secant === 0) {
      m[i] = 0
      m[i + 1] = 0
      return
    }
    const a = m[i]! / secant
    const b = m[i + 1]! / secant
    const size = Math.hypot(a, b)
    if (size > 3) {
      m[i] = (3 * a * secant) / size
      m[i + 1] = (3 * b * secant) / size
    }
  })
  return m
}

/** The cubic from point i to point i + 1, as its two control points. */
function controls(points: readonly Point[], m: readonly number[], i: number): [Point, Point] {
  const p = points[i]!
  const q = points[i + 1]!
  const dx = (q.x - p.x) / 3
  return [
    { x: p.x + dx, y: p.y + dx * m[i]! },
    { x: q.x - dx, y: q.y - dx * m[i + 1]! },
  ]
}

const at = (point: Point) => `${round(point.x)} ${round(point.y)}`

/** A smooth path through one run of points, as `M` then cubics; a lone point is a bare `M`. */
function curve(points: readonly Point[], reverse = false): string {
  const first = points[0]
  if (first === undefined) return ''
  if (points.length === 1) return `M${at(first)}`
  const m = slopes(points)
  let d = ''
  const order = points.map((_, i) => i)
  if (!reverse) {
    d = `M${at(first)}`
    for (const i of order.slice(0, -1)) {
      const [c1, c2] = controls(points, m, i)
      d += `C${at(c1)} ${at(c2)} ${at(points[i + 1]!)}`
    }
    return d
  }
  // Walked from the last point back, a segment's control points swap places.
  for (const i of order.slice(0, -1).reverse()) {
    const [c1, c2] = controls(points, m, i)
    d += `C${at(c2)} ${at(c1)} ${at(points[i]!)}`
  }
  return d
}

/**
 * The line through each run of points, smoothed, one subpath a run: where a run ends the pen lifts, so a
 * gap the caller breaks the line at is never bridged. A run of one point draws nothing: a dot marks it.
 */
export function smoothLinePath(runs: readonly (readonly Point[])[]): string {
  return runs
    .filter((run) => run.length >= 2)
    .map((run) => curve(run))
    .join('')
}

/**
 * The band between an upper and a lower edge, each given as the same runs, both smoothed. The upper edge is
 * walked left to right and the lower back, so the band closes on itself. Runs of fewer than two points
 * draw nothing.
 */
export function smoothBandPath(
  upper: readonly (readonly Point[])[],
  lower: readonly (readonly Point[])[],
): string {
  return upper
    .map((top, r) => {
      const bottom = lower[r]
      if (top.length < 2 || bottom === undefined || bottom.length < 2) return ''
      const back = curve(bottom, true)
      return `${curve(top)}L${at(bottom.at(-1)!)}${back}Z`
    })
    .join('')
}

/**
 * Area under each run, down to a baseline y: the smoothed line, then straight down and back along the
 * baseline. Runs of fewer than two points fill nothing.
 */
export function smoothAreaPath(runs: readonly (readonly Point[])[], baseline: number): string {
  return runs
    .filter((run) => run.length >= 2)
    .map((run) => {
      const last = run.at(-1)!
      return `${curve(run)}L${round(last.x)} ${round(baseline)}L${round(run[0]!.x)} ${round(baseline)}Z`
    })
    .join('')
}

/** A stretch of line shorter than this many points is a few readings, not a trend: it keeps its markers and no wash. */
export const SHORT_RUN_POINTS = 4

/**
 * The runs of a series of points that may be missing, each valued point in the run its stretch of line
 * belongs to. A new run starts at a point whose `breaks` flag is set, and a point without a value is
 * skipped without ending the run, so a gap that is not a break is bridged.
 */
export function runsOf(
  points: ReadonlyArray<Point | null>,
  breaks: ReadonlyArray<boolean>,
): Point[][] {
  const runs: Point[][] = []
  points.forEach((point, i) => {
    if (point === null || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return
    if (breaks[i] === true || runs.length === 0) runs.push([point])
    else runs[runs.length - 1]!.push(point)
  })
  return runs
}

/**
 * A stretch of line this short or shorter, cut off from the rest by breaks, is not a line: two points a week
 * apart draw as a dumbbell. It is drawn as one marker at the mean of its points instead.
 */
export const ISOLATED_MAX_POINTS = 2

/**
 * Whether the stretch at index `i` of `runs` is isolated: ISOLATED_MAX_POINTS points or fewer, and not the last,
 * which ends at the latest value, where the end marker and label belong, so it stays a line of its own.
 */
export const isIsolated = (run: readonly unknown[], i: number, runs: readonly unknown[]): boolean =>
  run.length <= ISOLATED_MAX_POINTS && i < runs.length - 1

/** The mean of some points. */
export function meanPoint(points: readonly Point[]): Point {
  const sum = points.reduce((total, p) => ({ x: total.x + p.x, y: total.y + p.y }), { x: 0, y: 0 })
  return { x: sum.x / points.length, y: sum.y / points.length }
}
