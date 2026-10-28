import type { LatLon } from '../import/trackpoints'

/** A valid Trackpoint. Missing device fields stay absent. */
export interface Point {
  tMs: number
  position?: LatLon
  distance?: number
  altitude?: number
  heartRate?: number
  power?: number
  speed?: number
  cadence?: number
  runCadence?: number
  temperature?: number
}

/**
 * Sorts by time, stably, then drops exact duplicates: same time and same values. Points that share
 * a time but differ are both kept. Cadence and temperature are not part of the match, so a repeated
 * point still collapses as it did before they were read.
 */
export function sortAndDedupe(points: Point[]): Point[] {
  const sorted = points.sort((a, b) => a.tMs - b.tMs)
  const out: Point[] = []
  let time = Number.NaN
  let seen = new Set<string>()
  for (const point of sorted) {
    if (point.tMs !== time) {
      time = point.tMs
      seen = new Set()
    }
    const key = JSON.stringify([
      point.position?.lat,
      point.position?.lon,
      point.distance,
      point.altitude,
      point.heartRate,
      point.power,
      point.speed,
    ])
    if (seen.has(key)) continue
    seen.add(key)
    out.push(point)
  }
  return out
}
