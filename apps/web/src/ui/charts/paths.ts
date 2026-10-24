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

/** The corners of a stepped line, in order: each sample's value holds to its own x, then steps. */
function stepCorners(points: readonly Point[]): Point[] {
  const corners: Point[] = []
  points.forEach((point, i) => {
    const before = points[i - 1]
    if (before !== undefined) corners.push({ x: point.x, y: before.y })
    corners.push(point)
  })
  return corners
}

/**
 * The band between two stepped edges, an upper and a lower, each sample by sample. The lower edge is
 * walked back, so the band closes. A week where either edge has no value breaks the band.
 */
export function stepBandPath(
  upper: ReadonlyArray<Point | null>,
  lower: ReadonlyArray<Point | null>,
): string {
  const bands: { upper: Point[]; lower: Point[] }[] = []
  let current: { upper: Point[]; lower: Point[] } | null = null
  for (let i = 0; i < upper.length; i++) {
    const top = upper[i] ?? null
    const bottom = lower[i] ?? null
    if (top === null || bottom === null) {
      current = null
      continue
    }
    if (current === null) {
      current = { upper: [], lower: [] }
      bands.push(current)
    }
    current.upper.push(top)
    current.lower.push(bottom)
  }
  // A band needs two samples to have an area; a lone sample draws nothing, as for an area.
  return bands
    .filter((band) => band.upper.length >= 2)
    .map((band) => {
      const corners = [...stepCorners(band.upper), ...stepCorners(band.lower).reverse()]
      return `${corners.map((corner, i) => `${i === 0 ? 'M' : 'L'}${round(corner.x)} ${round(corner.y)}`).join('')}Z`
    })
    .join('')
}

/** Area under each unbroken run of stepped points, down to a baseline y. A lone point fills nothing. */
export function stepAreaPath(points: ReadonlyArray<Point | null>, baseline: number): string {
  return contiguousRuns(points)
    .map((run) => {
      const first = run[0]
      if (run.length < 2 || first === undefined) return ''
      return `${stepPath(run)}V${round(baseline)}H${round(first.x)}Z`
    })
    .join('')
}
