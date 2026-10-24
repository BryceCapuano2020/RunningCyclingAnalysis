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
