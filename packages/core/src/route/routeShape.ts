import { acceptFixes, EARTH_RADIUS_M } from '../import/gps'
import type { GpsFix } from '../import/gps'
import { clamp, mean } from '../math'

/**
 * The outline of an outdoor track with its position removed. The track is projected on a plane
 * around its centre, its longer side is scaled to one, and the outline is simplified. Nothing in
 * the result gives a place, a distance or a time, so the shape can be drawn but not located.
 */
export interface RouteShape {
  /**
   * Points in the unit box, with y growing downwards as in SVG. The longer side spans [0, 1] before
   * simplification, so the simplified outline need not reach the edges of the box.
   */
  points: [number, number][]
  /** Width over height of the track's bounding box. */
  aspect: number
}

export interface GeoPoint {
  lat: number
  lon: number
}

export const MAX_ROUTE_POINTS = 256
/** A track whose longer side is this many metres or less has no shape worth drawing. */
const MIN_EXTENT_M = 50
/** The first simplification tolerance, as a share of the longer side. It doubles until the cap holds. */
const FIRST_TOLERANCE = 0.001
/** Simplification runs on at most this many points, so a very long track costs the same to outline. */
const MAX_SIMPLIFY_INPUT = 4096
const MIN_ASPECT = 0.001
const MAX_ASPECT = 1000

type Plane = [number, number]

/**
 * The shape of the points, or null when there are fewer than two valid ones or the track fits within
 * 50 m. Indoor activities have no shape: the caller passes none. Invalid points are ignored.
 */
export function routeShape(points: readonly GeoPoint[]): RouteShape | null {
  const valid = points.filter(isGeoPoint)
  const ref = valid[0]
  if (ref === undefined || valid.length < 2) return null
  const lat0 = mean(valid.map((p) => p.lat))
  const lon0 = ref.lon + mean(valid.map((p) => wrap(p.lon - ref.lon)))
  const cos = Math.cos(toRadians(lat0))
  const metres: Plane[] = valid.map((p) => [
    EARTH_RADIUS_M * toRadians(wrap(p.lon - lon0)) * cos,
    EARTH_RADIUS_M * toRadians(p.lat - lat0),
  ])

  // A loop, not Math.min(...values): a long track has more values than a call takes as arguments.
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [x, y] of metres) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  const width = maxX - minX
  const height = maxY - minY
  const extent = Math.max(width, height)
  if (extent <= MIN_EXTENT_M) return null

  // Scaled so the longer side spans [0, 1] before simplification, and flipped so north is up.
  const unit = metres.map(([x, y]): Plane => [(x - minX) / extent, (maxY - y) / extent])
  const kept = distinctConsecutive(
    simplifyToCap(thin(unit)).map(([x, y]) => [round3(x), round3(y)]),
  )
  if (kept.length < 2) return null
  return {
    points: kept,
    aspect: clamp(round3(width / height), MIN_ASPECT, MAX_ASPECT),
  }
}

/**
 * The shape of the accepted fixes that fall between fromMs and toMs, using the same rules that
 * measure a track's speed. Use it for one part of an activity, so each part has its own shape.
 */
export function routeFromFixes(
  fixes: readonly GpsFix[],
  fromMs: number,
  toMs: number,
  maxSpeedMs: number,
): RouteShape | null {
  const within = fixes.filter((fix) => fix.t >= fromMs && fix.t <= toMs)
  return routeShape(acceptFixes(within, maxSpeedMs).accepted)
}

/**
 * A shape read back from storage, or null when it is not one. Bounds are checked here, so a
 * damaged or foreign value is dropped rather than drawn.
 */
export function parseRouteShape(value: unknown): RouteShape | null {
  if (typeof value !== 'object' || value === null) return null
  const { points, aspect } = value as { points?: unknown; aspect?: unknown }
  if (!Array.isArray(points) || points.length < 2 || points.length > MAX_ROUTE_POINTS) return null
  if (typeof aspect !== 'number' || !(aspect >= MIN_ASPECT && aspect <= MAX_ASPECT)) return null
  const out: [number, number][] = []
  for (const point of points) {
    if (!Array.isArray(point) || point.length !== 2) return null
    const [x, y] = point
    if (!isUnit(x) || !isUnit(y)) return null
    out.push([x, y])
  }
  return { points: out, aspect }
}

function isGeoPoint(p: GeoPoint): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lon) <= 180
  )
}

function isUnit(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= 1
}

/** Every stride-th point, and the last one, so that simplification sees a bounded number of points. */
function thin(points: Plane[]): Plane[] {
  if (points.length <= MAX_SIMPLIFY_INPUT) return points
  const stride = Math.ceil(points.length / MAX_SIMPLIFY_INPUT)
  const out = points.filter((_, i) => i % stride === 0)
  const last = points[points.length - 1]!
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

/** Douglas-Peucker with a tolerance that doubles until the result fits the cap. */
function simplifyToCap(points: Plane[]): Plane[] {
  let tolerance = FIRST_TOLERANCE
  for (;;) {
    const kept = douglasPeucker(points, tolerance)
    if (kept.length <= MAX_ROUTE_POINTS) return kept
    tolerance *= 2
  }
}

/** The points that stay, with both ends. Iterative, so a long track cannot exhaust the stack. */
function douglasPeucker(points: Plane[], tolerance: number): Plane[] {
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const spans: [number, number][] = [[0, points.length - 1]]
  while (spans.length > 0) {
    const [first, last] = spans.pop()!
    let farthest = -1
    let farthestDistance = tolerance
    for (let i = first + 1; i < last; i++) {
      const distance = distanceToSegment(points[i]!, points[first]!, points[last]!)
      if (distance > farthestDistance) {
        farthest = i
        farthestDistance = distance
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1
      spans.push([first, farthest], [farthest, last])
    }
  }
  return points.filter((_, i) => keep[i] === 1)
}

function distanceToSegment(p: Plane, a: Plane, b: Plane): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const lengthSquared = dx * dx + dy * dy
  const t =
    lengthSquared === 0 ? 0 : clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared, 0, 1)
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Rounding can make neighbours equal; the outline needs only one of each run. */
function distinctConsecutive(points: Plane[]): [number, number][] {
  const out: [number, number][] = []
  for (const point of points) {
    const last = out[out.length - 1]
    if (last === undefined || last[0] !== point[0] || last[1] !== point[1]) out.push(point)
  }
  return out
}

/** A longitude difference wrapped into [-180, 180), so a track across the antimeridian stays whole. */
function wrap(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}
