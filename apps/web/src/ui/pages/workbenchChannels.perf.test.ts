import { describe, expect, it } from 'vitest'
import type { ActivityTrace, TraceMetric } from '@rca/core/workbench'
import { areaPath, bandPath, linePath } from '../charts/timeSeriesModel'
import { channelsFor } from './workbenchChannels'

/**
 * A six-hour ride at 1 Hz with five measures is what the page builds when it opens, at every step of a brush
 * drag (the heavy figures follow it deferred), and at every step of the cursor. The first must stay inside a
 * few frames, the second inside two, the cursor's inside a hundredth of one.
 */
const SECONDS = 6 * 3600
const METRICS: TraceMetric[] = ['speed', 'power', 'heartRate', 'cadence', 'altitude']

function ride(): ActivityTrace {
  const stream = (base: number, swing: number, phase: number) =>
    Float32Array.from(
      { length: SECONDS },
      (_, i) => base + swing * Math.sin(i / 900 + phase) + ((i * 7919) % 23),
    )
  return {
    version: 1,
    activityId: 'ride-6h',
    sport: 'ride',
    durationS: SECONDS,
    distance: Float64Array.from({ length: SECONDS }, (_, i) => i * 7),
    paused: new Uint8Array(SECONDS),
    unrecorded: new Uint8Array(SECONDS),
    streams: {
      speed: stream(7, 3, 0),
      power: stream(200, 80, 1),
      heartRate: stream(140, 20, 2),
      cadence: stream(85, 10, 3),
      altitude: stream(300, 100, 4),
    },
    laps: [],
  }
}

/** Everything a render of the stack draws from the channels: the paths of every row. */
function drawn(trace: ActivityTrace, startS: number, endS: number): number {
  const map = { x: (t: number) => t, y: (v: number) => v }
  let length = 0
  for (const channel of channelsFor(trace, METRICS, 'metric', startS, endS, 700, 3)) {
    length += linePath(channel.columns, map).length + bandPath(channel.columns, map).length
    length += areaPath(channel.columns, map, 0).length
  }
  return length
}

/** The fastest of five timed runs, ms, so neither the cold first call nor a stray pause counts. */
function fastestMs(run: () => void): number {
  let fastest = Infinity
  for (let i = 0; i < 5; i++) {
    const start = performance.now()
    run()
    fastest = Math.min(fastest, performance.now() - start)
  }
  return fastest
}

describe('the timeline of a 6-hour ride', () => {
  it('opens, from a trace nothing has been read of, in under 40 ms', () => {
    const base = ride()
    let length = 0
    // A new object each time is a trace nothing has been read of: the caches are keyed by the trace.
    const ms = fastestMs(() => {
      length = drawn({ ...base }, 0, SECONDS)
    })
    expect(length).toBeGreaterThan(10_000)
    expect(ms).toBeLessThan(40)
  })

  it('follows a brush drag, a new window at each step, in under 25 ms a step', () => {
    const trace = ride()
    drawn(trace, 0, SECONDS)
    let step = 0
    const ms = fastestMs(() => {
      step += 1
      drawn(trace, 100 * step, SECONDS - 100 * step)
    })
    expect(ms).toBeLessThan(25)
  })

  it('reads the cursor at every measure, with the same trace, in under a millisecond', () => {
    const trace = ride()
    const channels = channelsFor(trace, METRICS, 'metric', 0, SECONDS, 700, 3)
    let second = 0
    const ms = fastestMs(() => {
      for (let i = 0; i < 100; i++) {
        second = (second + 211) % SECONDS
        for (const channel of channels) channel.at(second)
      }
    })
    // A hundred steps at once, so the budget is a hundredth of a millisecond a step.
    expect(ms).toBeLessThan(1)
  })
})
