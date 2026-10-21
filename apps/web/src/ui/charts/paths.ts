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
