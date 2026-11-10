import type { ActivityTrace } from '@rca/core/workbench'

/** A ten-second run with a pause, an unrecorded second, a missing pace and two recorded laps. */
export function runTrace(): ActivityTrace {
  return {
    version: 1,
    activityId: 'run-1',
    sport: 'run',
    durationS: 10,
    distance: Float64Array.from([0, 3, 6, 9, 12, 15, 18, 21, 24, 27]),
    paused: Uint8Array.from([0, 0, 1, 0, 0, 0, 0, 0, 0, 0]),
    unrecorded: Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]),
    streams: {
      speed: Float32Array.from([3, 3, 3.1, 3.2, 3.1, 3, 3.2, 3.3, Number.NaN, 3.1]),
      heartRate: Float32Array.from([120, 121, 122, 123, 124, 125, 126, 127, 128, 129]),
      cadence: Float32Array.from([170, 171, 172, 173, 174, 175, 176, 177, 178, 179]),
    },
    laps: [
      { startS: 2, endS: 6 },
      { startS: 6, endS: 10 },
    ],
  }
}

/**
 * A steady run of `seconds` whole seconds with every second recorded and moving. Its readings differ by less than
 * anything shows (a recorder never reads one value to the last bit), so none of its rows is a constant, which the
 * page leaves out as "no data".
 */
export function steadyTrace(seconds: number, speed = 3): ActivityTrace {
  return {
    version: 1,
    activityId: 'run-2',
    sport: 'run',
    durationS: seconds,
    distance: Float64Array.from({ length: seconds }, (_, index) => index * speed),
    paused: new Uint8Array(seconds),
    unrecorded: new Uint8Array(seconds),
    streams: {
      speed: Float32Array.from({ length: seconds }, (_, i) => speed + (i % 2) * 0.001),
      heartRate: Float32Array.from({ length: seconds }, (_, i) => 140 + (i % 2) * 0.01),
    },
    laps: [],
  }
}

/** A stretch of an activity for repsTrace: its seconds, and the readings held through it. */
export interface Stretch {
  seconds: number
  speed?: number
  power?: number
  heartRate?: number
  /** Metres climbed each second; a stream of altitude is made when any stretch gives it. */
  climb?: number
}

/**
 * An activity made of stretches back to back, every second recorded and moving. A stream is present when
 * any stretch gives it. `laps` are the device's laps, as [startS, endS] pairs.
 */
export function repsTrace(
  sport: ActivityTrace['sport'],
  stretches: readonly Stretch[],
  laps: readonly (readonly [number, number])[] = [],
): ActivityTrace {
  const seconds = stretches.reduce((sum, stretch) => sum + stretch.seconds, 0)
  const stream = (read: (stretch: Stretch) => number | undefined): Float32Array | undefined => {
    if (stretches.every((stretch) => read(stretch) === undefined)) return undefined
    return Float32Array.from(
      stretches.flatMap((stretch) =>
        Array.from({ length: stretch.seconds }, () => read(stretch) ?? Number.NaN),
      ),
    )
  }
  const streams: ActivityTrace['streams'] = {}
  const climbs = stretches.flatMap((stretch) =>
    Array.from({ length: stretch.seconds }, () => stretch.climb ?? 0),
  )
  if (stretches.some((stretch) => stretch.climb !== undefined)) {
    let height = 100
    streams.altitude = Float32Array.from(climbs, (climb) => (height += climb))
  }
  for (const [metric, values] of [
    ['speed', stream((s) => s.speed)],
    ['power', stream((s) => s.power)],
    ['heartRate', stream((s) => s.heartRate)],
  ] as const) {
    if (values !== undefined) streams[metric] = values
  }
  return {
    version: 1,
    activityId: `${sport}-reps`,
    sport,
    durationS: seconds,
    distance: Float64Array.from({ length: seconds }, (_, i) => i * 3),
    paused: new Uint8Array(seconds),
    unrecorded: new Uint8Array(seconds),
    streams,
    laps: laps.map(([startS, endS]) => ({ startS, endS })),
  }
}
