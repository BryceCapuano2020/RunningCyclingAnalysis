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

/** Stable time ordering with exact duplicates removed. */
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
      point.cadence,
      point.runCadence,
      point.temperature,
    ])
    if (seen.has(key)) continue
    seen.add(key)
    out.push(point)
  }
  return out
}
