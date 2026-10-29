import { describe, expect, it } from 'vitest'
import { steadyTrace } from './workbenchFixtures'
import { downsampleActivityTrace } from './workbenchDownsample'

function speedRuns(values: number[], limit = 600) {
  const trace = steadyTrace(values.length)
  trace.streams.speed = Float32Array.from(values)
  return downsampleActivityTrace(trace, 'speed', 0, values.length, limit)
}

describe('downsampleActivityTrace', () => {
  it('draws a bucket that is mostly valid instead of blanking it', () => {
    const values = new Array<number>(10_000).fill(2)
    for (const index of [10, 12, 14, 16, 18, 20]) values[index] = Number.NaN
    const runs = speedRuns(values)
    // The single missing seconds are bridged, so the line is one stretch.
    expect(runs).toHaveLength(1)
    expect(runs[0]!.length).toBeLessThanOrEqual(600)
    expect(runs[0]![0]!.timeS).toBe(0)
    expect(runs[0]!.at(-1)!.timeS).toBe(9_999)
  })

  it('keeps the lowest and highest reading of each bucket', () => {
    const values = new Array<number>(10_000).fill(2)
    values[5_000] = 9
    values[5_001] = 0.7
    const points = speedRuns(values).flat()
    expect(points.some((point) => point.value === 9)).toBe(true)
    expect(points.some((point) => point.value === Math.fround(0.7))).toBe(true)
  })

  it('keeps an isolated reading as its own stretch', () => {
    const values = new Array<number>(100).fill(Number.NaN)
    values.fill(2, 0, 10)
    values[50] = 3
    values.fill(2, 90, 100)
    const runs = speedRuns(values)
    expect(runs).toHaveLength(3)
    expect(runs[1]).toEqual([{ timeS: 50, value: 3 }])
  })

  it('breaks the line at a real gap and bridges a few missing seconds', () => {
    const values = new Array<number>(30).fill(2)
    values.fill(Number.NaN, 5, 9)
    values.fill(Number.NaN, 20, 25)
    const runs = speedRuns(values)
    expect(runs.map((run) => [run[0]!.timeS, run.at(-1)!.timeS])).toEqual([
      [0, 19],
      [25, 29],
    ])
  })

  it('leaves out implausible source readings and paused seconds', () => {
    const trace = steadyTrace(10)
    trace.streams.heartRate = Float32Array.from([120, 121, 122, 123, 999, 125, 126, 127, 128, 129])
    trace.paused[8] = 1
    const points = downsampleActivityTrace(trace, 'heartRate', 0, 10, 600).flat()
    expect(points.map((point) => point.timeS)).not.toContain(4)
    expect(points.map((point) => point.timeS)).not.toContain(8)
    expect(points.some((point) => point.value === 999)).toBe(false)
  })
})
