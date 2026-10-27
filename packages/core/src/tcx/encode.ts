import { EARTH_RADIUS_M } from '../import/gps'
import type { Activity } from '../types'

/** Test-only: writes TCX as Garmin Connect does. The parser never imports it. */

export interface TcxEncodeOptions {
  /** Splits the Activity evenly into this many Laps. Defaults to 1. */
  laps?: number
  /** Restarts DistanceMeters at the start of each Lap. Defaults to false: one running total. */
  resetDistancePerLap?: boolean
  /** Writes TPX Speed. Defaults to true. */
  speed?: boolean
  /** Writes DistanceMeters. Defaults to true. */
  distance?: boolean
  /**
   * Writes positions on a route walked from a fixed start: each second moves the position by the
   * distance the Activity covered. The Activity has no coordinates, so the route is invented.
   * Without positions the ride reads as indoor.
   */
  gps?: boolean
  /** Metres of deterministic jitter added to each position. Only with gps. Defaults to 0. */
  noise?: number
}

interface LatLon {
  lat: number
  lon: number
}

const TCX_NAMESPACE = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2'
const EXTENSION_NAMESPACE = 'http://www.garmin.com/xmlschemas/ActivityExtension/v2'
const START: LatLon = { lat: 51.5, lon: -0.12 }
/** The route heads on one bearing, in radians clockwise from north. */
const BEARING = 0.6
const RAD = Math.PI / 180

/**
 * Writes a single-Activity TCX file with one Trackpoint per second. Missing (NaN) fields are
 * omitted, and seconds inside a pause are left out so the pause survives the round trip.
 */
export function encodeTcx(activity: Activity, opts: TcxEncodeOptions = {}): Uint8Array {
  const { n } = activity
  const start = new Date(activity.startMs).toISOString()
  const sport = { run: 'Running', ride: 'Biking' }[activity.sport]
  const laps = Math.max(1, Math.min(opts.laps ?? 1, n))
  const route = opts.gps ? routeOf(activity, opts.noise ?? 0) : []

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<TrainingCenterDatabase xmlns="${TCX_NAMESPACE}" xmlns:ns3="${EXTENSION_NAMESPACE}">`,
    '  <Activities>',
    `    <Activity Sport="${sport}">`,
    `      <Id>${start}</Id>`,
  ]
  for (let k = 0; k < laps; k++) {
    const from = Math.floor((k * n) / laps)
    const to = Math.floor(((k + 1) * n) / laps)
    lines.push(...lapXml(activity, from, to, opts, route))
  }
  lines.push('    </Activity>', '  </Activities>', '</TrainingCenterDatabase>')
  return new TextEncoder().encode(`${lines.join('\n')}\n`)
}

/** One Lap covering indexes [from, to). Paused seconds are left out of its Track. */
function lapXml(
  activity: Activity,
  from: number,
  to: number,
  opts: TcxEncodeOptions,
  route: (LatLon | undefined)[],
): string[] {
  const base = distanceBase(activity, from, opts)
  const points: string[] = []
  for (let i = from; i < to; i++) {
    if (activity.paused[i] === 1) continue
    points.push(trackpoint(activity, i, opts, route[i], base))
  }
  const lines = [
    `      <Lap StartTime="${isoAt(activity.startMs, from)}">`,
    `        <TotalTimeSeconds>${to - from}</TotalTimeSeconds>`,
  ]
  if (opts.distance !== false) {
    const end = sample(activity.distance, to - 1) ?? base
    lines.push(`        <DistanceMeters>${to > from ? end - base : 0}</DistanceMeters>`)
  }
  lines.push(
    '        <Intensity>Active</Intensity>',
    '        <TriggerMethod>Manual</TriggerMethod>',
    '        <Track>',
    ...points,
    '        </Track>',
    '      </Lap>',
  )
  return lines
}

/**
 * The distance that DistanceMeters counts from at a Lap's first second: zero, or with
 * resetDistancePerLap the running total just before the Lap.
 */
function distanceBase(activity: Activity, from: number, opts: TcxEncodeOptions): number {
  if (!opts.resetDistancePerLap || from === 0) return 0
  return sample(activity.distance, from - 1) ?? 0
}

function trackpoint(
  activity: Activity,
  i: number,
  opts: TcxEncodeOptions,
  position: LatLon | undefined,
  base: number,
): string {
  const parts = [`<Time>${isoAt(activity.startMs, i)}</Time>`]
  if (position !== undefined) {
    parts.push(
      `<Position><LatitudeDegrees>${position.lat}</LatitudeDegrees>` +
        `<LongitudeDegrees>${position.lon}</LongitudeDegrees></Position>`,
    )
  }
  parts.push(field('AltitudeMeters', sample(activity.altitude, i)))
  if (opts.distance !== false) {
    const total = sample(activity.distance, i)
    parts.push(field('DistanceMeters', total === undefined ? undefined : total - base))
  }
  const heartRate = sample(activity.heartRate, i)
  if (heartRate !== undefined) {
    parts.push(`<HeartRateBpm><Value>${heartRate}</Value></HeartRateBpm>`)
  }
  const extension = [
    opts.speed === false ? '' : field('ns3:Speed', sample(activity.speed, i)),
    field('ns3:Watts', sample(activity.power, i)),
  ].join('')
  if (extension !== '') parts.push(`<Extensions><ns3:TPX>${extension}</ns3:TPX></Extensions>`)
  return `          <Trackpoint>${parts.join('')}</Trackpoint>`
}

/**
 * The route for each second: the start, then a destination-point step per second of distance.
 * Paused seconds have no position. Noise moves each written position by up to `noise` metres.
 */
function routeOf(activity: Activity, noise: number): (LatLon | undefined)[] {
  const route: (LatLon | undefined)[] = []
  let here: LatLon | undefined
  let travelled = 0
  for (let i = 0; i < activity.n; i++) {
    if (activity.paused[i] === 1) {
      route.push(undefined)
      continue
    }
    const total = Math.max(travelled, sample(activity.distance, i) ?? travelled)
    here = here === undefined ? START : destination(here, BEARING, total - travelled)
    travelled = total
    route.push(noise > 0 ? destination(here, 2 * Math.PI * hash(i, 2), noise * hash(i, 1)) : here)
  }
  return route
}

/** The point `metres` away from `from` on `bearing`, on the sphere the parser projects with. */
function destination(from: LatLon, bearing: number, metres: number): LatLon {
  const delta = metres / EARTH_RADIUS_M
  const phi1 = from.lat * RAD
  const lambda1 = from.lon * RAD
  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(bearing),
  )
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2),
    )
  return { lat: phi2 / RAD, lon: lambda2 / RAD }
}

/** A deterministic value in [0, 1) for a second and a salt, so noise is the same every run. */
function hash(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

function isoAt(startMs: number, index: number): string {
  return new Date(startMs + index * 1000).toISOString()
}

function field(name: string, value: number | undefined): string {
  return value === undefined ? '' : `<${name}>${value}</${name}>`
}

function sample(xs: Float64Array, i: number): number | undefined {
  const value = xs[i]
  return value !== undefined && Number.isFinite(value) ? value : undefined
}
