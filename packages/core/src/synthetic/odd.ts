import { DAY_MS } from '../constants'
import { MAX_FILE_SAMPLES } from '../import/result'
import type { Activity, Sport } from '../types'

/** Metres a second of a steady run and of a steady ride. */
const PACE: Record<Sport, number> = { run: 3, ride: 7 }

/** Fixed, so the libraries are the same on every run: a Monday morning in June 2025. */
const START_MS = Date.UTC(2025, 5, 2, 7)

interface Shape {
  id: string
  sport: Sport
  n: number
  startMs?: number
  /** Metres a second. Default PACE; 0 for a recording that moves nowhere. */
  speed?: number
  /** Beats a minute; none when absent. */
  heartRate?: number
  /** Watts of a power meter; none when absent. */
  power?: number
  indoor?: boolean
}

/** A steady activity of one pace and one heart rate, however odd its length or what it records. */
function steady(shape: Shape): Activity {
  const { id, sport, n, heartRate, power } = shape
  const speed = shape.speed ?? PACE[sport]
  const moves = speed > 0
  const distance = Float64Array.from({ length: n }, (_, i) => i * speed)
  return {
    id,
    name: id,
    sport,
    startMs: shape.startMs ?? START_MS,
    n,
    speed: new Float64Array(n).fill(speed),
    distance,
    altitude: new Float64Array(n).fill(moves ? 100 : Number.NaN),
    heartRate: new Float64Array(n).fill(heartRate ?? Number.NaN),
    power: new Float64Array(n).fill(power ?? Number.NaN),
    paused: new Uint8Array(n),
    hasPower: power !== undefined,
    hasHeartRate: heartRate !== undefined,
    hasAltitude: moves,
    hasMotion: moves,
    indoor: shape.indoor ?? false,
  }
}

export type OddLibraryName =
  | 'zero-length'
  | 'heart-rate-only'
  | 'forty-eight-hours'
  | 'same-start'
  | 'one-in-the-period'
  | 'all-indoor'
  | 'runs-only'
  | 'rides-only'

/** A day-and-hour offset from the start, so that no two activities of a library start together. */
function at(days: number, hours = 0): number {
  return START_MS + days * DAY_MS + hours * 3_600_000
}

/**
 * Libraries of the activities that real files hold and a tidy synthetic one does not. Each is a set of
 * activities for a caller to digest, built around the one odd case so that nothing ordinary hides what
 * the analysis and the pages make of it.
 */
export function oddLibraries(): Record<OddLibraryName, Activity[]> {
  return {
    // A file with no samples, one with a single sample, and one with two.
    'zero-length': [
      steady({ id: 'empty-run', sport: 'run', n: 0 }),
      steady({ id: 'one-second-ride', sport: 'ride', n: 1, startMs: at(1) }),
      steady({ id: 'two-second-run', sport: 'run', n: 2, startMs: at(2), heartRate: 140 }),
    ],
    // A strap and a watch that moved nowhere: a heart rate, and no speed, distance or altitude.
    'heart-rate-only': [
      steady({ id: 'strap-run', sport: 'run', n: 1800, speed: 0, heartRate: 150 }),
      steady({
        id: 'strap-ride',
        sport: 'ride',
        n: 2400,
        speed: 0,
        heartRate: 135,
        startMs: at(1),
      }),
    ],
    // The longest file the importer accepts, as a run and as a ride with a power meter.
    'forty-eight-hours': [
      steady({ id: 'ultra-run', sport: 'run', n: MAX_FILE_SAMPLES, speed: 2, heartRate: 130 }),
      steady({
        id: 'tour-ride',
        sport: 'ride',
        n: MAX_FILE_SAMPLES,
        heartRate: 120,
        power: 180,
        startMs: at(4),
      }),
    ],
    // Two files of one workout under different names, and two that start a millisecond apart.
    'same-start': [
      steady({ id: 'watch-run', sport: 'run', n: 1800, heartRate: 150 }),
      steady({ id: 'phone-run', sport: 'run', n: 1800, heartRate: 150 }),
      steady({ id: 'early-ride', sport: 'ride', n: 3000, heartRate: 140, startMs: at(1) }),
      steady({ id: 'later-ride', sport: 'ride', n: 3000, heartRate: 140, startMs: at(1) + 1 }),
    ],
    // Months of training, then one run alone in the last weeks: a six-week period holds a single
    // activity, and the default falls back to all time since no 12 weeks hold a run and a ride.
    'one-in-the-period': [
      ...Array.from({ length: 10 }, (_, i) =>
        steady({
          id: `old-${i}`,
          sport: i % 2 === 0 ? 'run' : 'ride',
          n: 2700,
          heartRate: 145,
          startMs: at(i * 7),
        }),
      ),
      steady({ id: 'newest-run', sport: 'run', n: 2700, heartRate: 150, startMs: at(400) }),
    ],
    // A treadmill and a trainer, with a power meter on the trainer, and nothing outdoors.
    'all-indoor': Array.from({ length: 12 }, (_, i) =>
      steady({
        id: `indoor-${i}`,
        sport: i % 2 === 0 ? 'run' : 'ride',
        n: 2400,
        heartRate: 140 + i,
        ...(i % 2 === 0 ? {} : { power: 170 + 5 * i }),
        indoor: true,
        startMs: at(i * 2),
      }),
    ),
    'runs-only': Array.from({ length: 8 }, (_, i) =>
      steady({ id: `run-${i}`, sport: 'run', n: 2400, heartRate: 150, startMs: at(i * 3) }),
    ),
    'rides-only': Array.from({ length: 8 }, (_, i) =>
      steady({
        id: `ride-${i}`,
        sport: 'ride',
        n: 3600,
        heartRate: 140,
        power: 200 + i,
        startMs: at(i * 3),
      }),
    ),
  }
}
