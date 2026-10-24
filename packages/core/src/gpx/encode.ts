import { EARTH_RADIUS_M } from '../import/gps'
import type { Activity } from '../types'

export interface EncodeGpxOptions {
  /** The text written to `<type>`, for example `running` or `9`. Chosen from the sport when omitted. */
  type?: string
  /**
   * Independent Gaussian error on every point: `sigmaM` metres on each axis, drawn from a generator
   * seeded with `seed`, so the same options always give the same file.
   */
  noise?: { sigmaM: number; seed: number }
}

interface LatLon {
  lat: number
  lon: number
}

const DEG = 180 / Math.PI
const RAD = Math.PI / 180
/** Tracks start here, away from (0, 0), which the importer rejects as a bad fix. */
const ORIGIN: LatLon = { lat: 51, lon: -0.1 }

/**
 * Writes a GPX 1.1 file with one track. Each run of seconds that are not paused is one track
 * segment, so a pause shows as a gap between segments and seconds inside it are left out, as in
 * encodeFit. Points are placed with the spherical destination-point formula, north from ORIGIN by
 * the cumulative distance, so the great-circle distance between consecutive points reproduces the
 * Activity's distance. Heart rate uses the Garmin TrackPointExtension and power a plain `power`
 * element. Missing (NaN) values are omitted. Test-only: the parser never imports it.
 */
export function encodeGpx(activity: Activity, opts: EncodeGpxOptions = {}): Uint8Array {
  const type = opts.type ?? (activity.sport === 'run' ? 'running' : 'cycling')
  const noise = opts.noise === undefined ? undefined : seededNoise(opts.noise)
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"' +
      ' xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">',
    '<trk>',
    `<type>${escapeText(type)}</type>`,
  ]
  let inSegment = false
  for (let i = 0; i < activity.n; i++) {
    if (activity.paused[i] === 1) {
      if (inSegment) lines.push('</trkseg>')
      inSegment = false
      continue
    }
    if (!inSegment) lines.push('<trkseg>')
    inSegment = true
    lines.push(trackPoint(activity, i, noise))
  }
  if (inSegment) lines.push('</trkseg>')
  lines.push('</trk>', '</gpx>')
  return new TextEncoder().encode(lines.join('\n') + '\n')
}

/**
 * Destination point from `from`, `angular` radians along a great circle that leaves at `bearing`
 * radians clockwise from north (spherical law of sines and cosines).
 */
function destination(from: LatLon, angular: number, bearing: number): LatLon {
  const phi1 = from.lat * RAD
  const lambda1 = from.lon * RAD
  const sinPhi2 =
    Math.sin(phi1) * Math.cos(angular) + Math.cos(phi1) * Math.sin(angular) * Math.cos(bearing)
  const phi2 = Math.asin(sinPhi2)
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(phi1),
      Math.cos(angular) - Math.sin(phi1) * sinPhi2,
    )
  return { lat: phi2 * DEG, lon: lambda2 * DEG }
}

type Noise = () => { north: number; east: number }

/** Two independent Gaussian draws per call, from mulberry32 and Box-Muller. */
function seededNoise(options: { sigmaM: number; seed: number }): Noise {
  let state = options.seed >>> 0
  const uniform = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const gaussian = (): number => {
    let u = 0
    while (u === 0) u = uniform()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uniform())
  }
  return () => ({ north: options.sigmaM * gaussian(), east: options.sigmaM * gaussian() })
}

function position(activity: Activity, i: number, noise: Noise | undefined): LatLon {
  const along = finite(activity.distance[i]) ?? 0
  const base = destination(ORIGIN, along / EARTH_RADIUS_M, 0)
  if (noise === undefined) return base
  const { north, east } = noise()
  return destination(base, Math.hypot(north, east) / EARTH_RADIUS_M, Math.atan2(east, north))
}

function trackPoint(activity: Activity, i: number, noise: Noise | undefined): string {
  const { lat, lon } = position(activity, i, noise)
  const time = new Date(activity.startMs + i * 1000).toISOString()
  const altitude = finite(activity.altitude[i])
  const heartRate = finite(activity.heartRate[i])
  const power = finite(activity.power[i])

  const parts = [`<trkpt lat="${lat.toFixed(9)}" lon="${lon.toFixed(9)}">`]
  if (altitude !== undefined) parts.push(`<ele>${altitude}</ele>`)
  parts.push(`<time>${time}</time>`)
  if (heartRate !== undefined || power !== undefined) {
    parts.push('<extensions>')
    if (power !== undefined) parts.push(`<power>${power}</power>`)
    if (heartRate !== undefined) {
      parts.push(
        `<gpxtpx:TrackPointExtension><gpxtpx:hr>${heartRate}</gpxtpx:hr></gpxtpx:TrackPointExtension>`,
      )
    }
    parts.push('</extensions>')
  }
  parts.push('</trkpt>')
  return parts.join('')
}

function finite(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) ? value : undefined
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
