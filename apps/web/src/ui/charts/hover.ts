import type { Point } from './chartTypes'

/** Index of the position nearest in x, or null when there are none. */
export function nearestByX(positions: readonly number[], x: number): number | null {
  let best: number | null = null
  let bestDistance = Infinity
  for (let i = 0; i < positions.length; i++) {
    const distance = Math.abs((positions[i] ?? Infinity) - x)
    if (distance < bestDistance) {
      bestDistance = distance
      best = i
    }
  }
  return best
}

/**
 * Index of the last position at or before x, for positions in ascending order, or null before the
 * first. A stepped line holds each value until the next sample, so the pointer reads the value it is
 * drawn at.
 */
export function lastAtOrBefore(positions: readonly number[], x: number): number | null {
  let found: number | null = null
  for (let i = 0; i < positions.length; i++) {
    if ((positions[i] ?? Infinity) > x) break
    found = i
  }
  return found
}

/** How a pointer's x picks a point from ascending positions: nearest, or the last at or before. */
export type PositionPick = (positions: readonly number[], x: number) => number | null

/** Index of the nearest point within maxDistance (in pixels), or null. */
export function nearestByPoint(
  points: readonly Point[],
  target: Point,
  maxDistance: number,
): number | null {
  let best: number | null = null
  let bestDistance = Infinity
  for (let i = 0; i < points.length; i++) {
    const point = points[i]
    if (point === undefined) continue
    const distance = Math.hypot(point.x - target.x, point.y - target.y)
    if (distance <= maxDistance && distance < bestDistance) {
      bestDistance = distance
      best = i
    }
  }
  return best
}

export interface ActiveTarget {
  index: number | null
}

/**
 * Where the active point moves for a key. Arrows step through points in x order and start
 * from the ends; Home and End jump to the first and last point; Escape clears it. Returns null
 * for keys this chart does not handle.
 */
export function stepActive(
  current: number | null,
  count: number,
  key: string,
): ActiveTarget | null {
  if (count === 0) return null
  switch (key) {
    case 'ArrowRight':
      return { index: current === null ? 0 : Math.min(current + 1, count - 1) }
    case 'ArrowLeft':
      return { index: current === null ? count - 1 : Math.max(current - 1, 0) }
    case 'Home':
      return { index: 0 }
    case 'End':
      return { index: count - 1 }
    case 'Escape':
      return { index: null }
    default:
      return null
  }
}
