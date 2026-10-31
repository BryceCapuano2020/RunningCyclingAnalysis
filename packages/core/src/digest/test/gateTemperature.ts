import { mulberry32 } from '../../math'
import { encodeFit } from '../../fit/encode'
import { encodeGpx } from '../../gpx/encode'
import { parseActivityFile } from '../../import'
import { encodeTcx } from '../../tcx/encode'
import type { Activity } from '../../types'
import { syntheticActivity } from './syntheticActivity'

/**
 * Seeded runs that carry a recorded temperature, as files, so a test can digest them with the temperature
 * summary on and off. No real data.
 */

/** 2026-06-20T07:00:00Z. */
export const SUMMER_MS = Date.UTC(2026, 5, 20, 7, 0, 0)

/** The reading each second of a run of `n` seconds, in degrees Celsius; NaN for no reading. */
export type TemperatureProfile = (second: number, n: number) => number

/** A steady run of `n` seconds at 3 m/s with a seeded wobble in heart rate and the given temperatures. */
export function runWithTemperature(
  n: number,
  profile: TemperatureProfile,
  options: { startMs?: number; paused?: Uint8Array } = {},
): Activity {
  const rand = mulberry32(17)
  let hr = 150
  const heartRate = Float64Array.from({ length: n }, () => {
    hr += (150 - hr) * 0.05 + (rand() - 0.5) * 2
    return Math.round(hr)
  })
  const run = syntheticActivity({
    id: 'warm',
    n,
    startMs: options.startMs ?? SUMMER_MS,
    speed: new Float64Array(n).fill(3),
    heartRate,
    ...(options.paused === undefined ? {} : { paused: options.paused }),
  })
  run.temperature = Float32Array.from({ length: n }, (_, i) => profile(i, n))
  return run
}

/** T1: a ramp from 18 to 22 degrees over the run, with a three-minute spike of +15 in the middle. */
export const rampWithSpike: TemperatureProfile = (i, n) => {
  const base = 18 + (4 * i) / n
  const middle = Math.floor(n / 2)
  return i >= middle && i < middle + 180 ? base + 15 : base
}

/** A flat temperature. */
export const flat =
  (c: number): TemperatureProfile =>
  () =>
    c

/** A flat temperature with a reading on `tenths` seconds in every ten and none on the rest. */
export const readingsInTen =
  (c: number, tenths: number): TemperatureProfile =>
  (i) =>
    i % 10 < tenths ? c : NaN

/** The reading the FIT sensor writes for no value, and two that are out of range. */
export const SENTINEL_C = 127

export function fitBytes(activity: Activity): Uint8Array {
  return encodeFit(activity, { gps: true })
}

/** The GPX of the run with `<gpxtpx:atemp>` on every point that has a reading. */
export function gpxWithTemperature(activity: Activity): Uint8Array {
  let second = 0
  const text = new TextDecoder()
    .decode(encodeGpx(activity))
    .replace(/<\/gpxtpx:TrackPointExtension>/g, () => {
      const reading = activity.temperature?.[second++]
      return Number.isFinite(reading)
        ? `<gpxtpx:atemp>${reading}</gpxtpx:atemp></gpxtpx:TrackPointExtension>`
        : '</gpxtpx:TrackPointExtension>'
    })
  return new TextEncoder().encode(text)
}

/** The TCX of the run with `<ns3:Temp>` in the extension of every trackpoint that has a reading. */
export function tcxWithTemperature(activity: Activity): Uint8Array {
  let second = 0
  const text = new TextDecoder()
    .decode(encodeTcx(activity, { gps: true }))
    .replace(/<\/ns3:TPX>/g, () => {
      const reading = activity.temperature?.[second++]
      return Number.isFinite(reading) ? `<ns3:Temp>${reading}</ns3:Temp></ns3:TPX>` : '</ns3:TPX>'
    })
  return new TextEncoder().encode(text)
}

/** The file read as the importer reads it; throws if it does not read. */
export function readRun(bytes: Uint8Array, name: string): Activity {
  const parsed = parseActivityFile(bytes, name, undefined, { activityType: 'Run' })
  const first = parsed.ok ? parsed.activities[0] : undefined
  if (first === undefined) throw new Error(`${name} did not read`)
  return first
}

/** A run with `n` seconds whose seconds from `from` to `to` are paused (the device was not recording). */
export function pausedBetween(n: number, from: number, to: number): Uint8Array {
  return Uint8Array.from({ length: n }, (_, i) => (i >= from && i < to ? 1 : 0))
}

/** The runs the gate test reads as files, by what they exercise. Seeded; the temperature is the only thing that differs. */
export const TEMPERATURE_CASES: Record<string, () => Activity> = {
  'FIT run, a ramp with a three-minute spike': () =>
    readRun(fitBytes(runWithTemperature(2400, rampWithSpike)), 'a.fit'),
  'FIT run, no temperature': () => {
    const run = runWithTemperature(2400, flat(20))
    delete run.temperature
    return readRun(fitBytes(run), 'a.fit')
  },
  'FIT run, a reading on 4 seconds in 10': () =>
    readRun(fitBytes(runWithTemperature(2400, readingsInTen(20, 4))), 'a.fit'),
  'FIT run of 15 minutes': () => readRun(fitBytes(runWithTemperature(900, flat(20))), 'a.fit'),
  'FIT run, readings out of range': () =>
    readRun(fitBytes(runWithTemperature(2400, (i) => (i % 2 === 0 ? 60 : -40))), 'a.fit'),
  'FIT run, 13 minutes paused in the middle': () =>
    readRun(
      fitBytes(runWithTemperature(2400, flat(20), { paused: pausedBetween(2400, 900, 1700) })),
      'a.fit',
    ),
  'GPX run with a temperature': () =>
    readRun(gpxWithTemperature(runWithTemperature(1800, flat(21))), 'a.gpx'),
  'TCX run with a temperature': () =>
    readRun(tcxWithTemperature(runWithTemperature(1800, flat(21))), 'a.tcx'),
}
