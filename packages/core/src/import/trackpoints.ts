import { isUsableLatLon, trackFromFixes } from './gps'
import type { GpsFix, GpsTrack } from './gps'
import { MAX_FIELD_CHARS } from './limits'
import type { RejectCode } from './result'

/** Rules shared by the GPX and TCX readers: refusals, XML numbers and positions, GPS tracks. */

/** Stops a scan with a reason for the user, unlike a malformed document. */
export class Refusal extends Error {
  readonly reason: string
  readonly code: RejectCode
  readonly detail: string | undefined

  constructor(reason: string, code: RejectCode, detail?: string) {
    super(reason)
    this.reason = reason
    this.code = code
    this.detail = detail
  }
}

/** The detail of a `too-much-data` refusal for a file that holds too many tracks or activities to be one file. */
export const SPLIT_THE_FILE = 'split'

export interface LatLon {
  lat: number
  lon: number
}

/** A point with a time and, when it has one, a position. */
export interface TimedPoint {
  tMs: number
  position?: LatLon | undefined
}

/**
 * A decimal. Each digit run is matched one way only (the dot is part of the one group that may follow the
 * integer digits), so a long run of digits ending in a letter fails in one pass and not by trying every split.
 */
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

/** The most characters a number's text may have once trimmed: a double needs under 25. */
const MAX_NUMBER_CHARS = 64

/** `text` after `more`, held to MAX_FIELD_CHARS (one more character stays, so an overlong field is still seen as such). */
export function appendField(text: string, more: string): string {
  return text.length > MAX_FIELD_CHARS ? text : (text + more).slice(0, MAX_FIELD_CHARS + 1)
}

/**
 * A finite decimal number from XML text, or undefined. Blank text and hexadecimal are not numbers,
 * although Number() reads hexadecimal.
 */
export function readNumber(text: string | undefined): number | undefined {
  // The padding of indented XML is whitespace, so a text this long is not a number whatever it holds.
  if (text === undefined || text.length > MAX_FIELD_CHARS) return undefined
  const trimmed = text.trim()
  if (trimmed.length > MAX_NUMBER_CHARS || !DECIMAL.test(trimmed)) return undefined
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

/** Whether a position is present and usable: a (0,0) placeholder does not count. */
export function hasUsablePosition(position: LatLon | undefined): boolean {
  return position !== undefined && isUsableLatLon(position.lat, position.lon)
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
