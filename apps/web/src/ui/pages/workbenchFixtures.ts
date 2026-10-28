import type { ActivityTrace } from '@rca/core/workbench'

/** A ten-second run with a pause, an unrecorded second, a missing pace and one recorded lap. */
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
    laps: [{ startS: 2, endS: 6 }],
  }
}

/** A steady run of `seconds` whole seconds with every second recorded and moving. */
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
      speed: new Float32Array(seconds).fill(speed),
      heartRate: new Float32Array(seconds).fill(140),
    },
    laps: [],
  }
}
