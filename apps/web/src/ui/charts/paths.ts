import type { Point } from './chartTypes'

const round = (value: number): number => Math.round(value * 10) / 10

/**
 * Polyline through the points. A null entry, or a non-finite point, lifts the pen so that a
 * gap in the data breaks the line instead of bridging it.
 */
export function linePath(points: ReadonlyArray<Point | null>): string {
  let d = ''
  let open = false
  for (const point of points) {
    if (point === null || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      open = false
      continue
    }
    d += `${open ? 'L' : 'M'}${round(point.x)} ${round(point.y)}`
    open = true
  }
  return d
}

/** Closed area between an upper and a lower edge, each given left to right. */
export function bandPath(upper: readonly Point[], lower: readonly Point[]): string {
  if (upper.length < 2) return ''
  const top = linePath(upper)
  const bottom = [...lower]
    .reverse()
    .map((point) => `L${round(point.x)} ${round(point.y)}`)
    .join('')
  return `${top}${bottom}Z`
}

/** The unbroken runs of finite points, in order: a null entry ends one run and starts the next. */
function contiguousRuns(points: ReadonlyArray<Point | null>): Point[][] {
  const runs: Point[][] = []
  let run: Point[] | null = null
  for (const point of points) {
    if (point === null || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      run = null
    } else if (run === null) {
      run = [point]
      runs.push(run)
    } else {
      run.push(point)
    }
  }
  return runs
}

/**
 * The band between two edges, point by point, broken wherever either edge has no value, so a band never
 * bridges a gap that its line does not. A lone point draws nothing, as for an area.
 */
export function gappedBandPath(
  upper: ReadonlyArray<Point | null>,
  lower: ReadonlyArray<Point | null>,
): string {
  const runs: { upper: Point[]; lower: Point[] }[] = []
  let current: { upper: Point[]; lower: Point[] } | null = null
  upper.forEach((top, i) => {
    const bottom = lower[i] ?? null
    if (top === null || bottom === null) {
      current = null
      return
    }
    if (current === null) {
      current = { upper: [], lower: [] }
      runs.push(current)
    }
    current.upper.push(top)
    current.lower.push(bottom)
  })
  return runs.map((run) => bandPath(run.upper, run.lower)).join('')
}

/** Area fills under each unbroken run of points, down to a baseline y. A lone point fills nothing. */
export function areaPath(points: ReadonlyArray<Point | null>, baseline: number): string {
  return contiguousRuns(points)
    .map((run) => {
      const first = run[0]
      const last = run.at(-1)
      if (run.length < 2 || first === undefined || last === undefined) return ''
      return bandPath(run, [
        { x: first.x, y: baseline },
        { x: last.x, y: baseline },
      ])
    })
    .join('')
}

/**
 * Steps after each point: a value holds from its sample to the next sample, then changes there.
 * A gap lifts the pen, as in linePath.
 */
export function stepPath(points: ReadonlyArray<Point | null>): string {
  let d = ''
  let open = false
  for (const point of points) {
    if (point === null || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      open = false
      continue
    }
    d += open ? `H${round(point.x)}V${round(point.y)}` : `M${round(point.x)} ${round(point.y)}`
    open = true
  }
  return d
}
