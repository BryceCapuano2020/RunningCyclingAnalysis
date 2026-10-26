import { trackFromFixes } from './gps'
import type { GpsFix, GpsTrack } from './gps'
import type { RejectCode } from './result'

/** Rules shared by the GPX and TCX readers: refusals, XML numbers and positions, GPS tracks. */

/** Stops a scan with a reason for the user, unlike a malformed document. */
export class Refusal extends Error {
  readonly reason: string
  readonly code: RejectCode

  constructor(reason: string, code: RejectCode) {
    super(reason)
    this.reason = reason
    this.code = code
  }
}

export interface LatLon {
  lat: number
  lon: number
}

/** A point with a time and, when it has one, a position. */
export interface TimedPoint {
  tMs: number
  position?: LatLon | undefined
}

const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/

/**
 * A finite decimal number from XML text, or undefined. Blank text and hexadecimal are not numbers,
 * although Number() reads hexadecimal.
 */
export function readNumber(text: string | undefined): number | undefined {
  const trimmed = text?.trim() ?? ''
  if (!DECIMAL.test(trimmed)) return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

/** A finite, non-negative number from XML text, or undefined. Used for heart rate, power, distance and speed. */
export function readNonNegative(text: string | undefined): number | undefined {
  const value = readNumber(text)
  return value !== undefined && value >= 0 ? value : undefined
}

/** A position from latitude and longitude text. Latitude is within 90 and longitude within 180. */
export function readPosition(lat: string | undefined, lon: string | undefined): LatLon | undefined {
  const latitude = readNumber(lat)
  const longitude = readNumber(lon)
  if (latitude === undefined || longitude === undefined) return undefined
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined
  return { lat: latitude, lon: longitude }
}

/**
 * The GPS track of the points that have a position, from trackFromFixes. Points without one are
 * skipped, so with no positions the track is empty.
 */
export function trackFromPoints(points: readonly TimedPoint[], maxSpeedMs: number): GpsTrack {
  return trackFromFixes(fixesOf(points), { maxSpeedMs })
}

/** The positions of the points that have one, in the order given. */
export function fixesOf(points: readonly TimedPoint[]): GpsFix[] {
  const fixes: GpsFix[] = []
  for (const point of points) {
    if (point.position !== undefined) {
      fixes.push({ t: point.tMs, lat: point.position.lat, lon: point.position.lon })
    }
  }
  return fixes
}
