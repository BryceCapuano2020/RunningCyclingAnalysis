import { describe, expect, it } from 'vitest'
import { MAX_FILE_SAMPLES } from '../import/result'
import { syntheticActivity } from '../digest/test/syntheticActivity'
import { fastestMs } from '../test/timing'
import { activityTraceOf, parseActivityTrace } from './trace'

/**
 * The trace of the longest file the importer accepts, 48 hours with power, cadence and temperature,
 * takes about 1 ms to build and about 10 ms to check and copy when it is stored or read back. The
 * budgets are about five times those, so a callback per sample, or a copy per stream beyond the one
 * that is made, fails them on a loaded runner too.
 */
const BUILD_BUDGET_MS = 6
const PARSE_BUDGET_MS = 50

function longRide() {
  const n = MAX_FILE_SAMPLES
  const activity = syntheticActivity({
    n,
    sport: 'ride',
    power: Float64Array.from({ length: n }, (_, i) => 150 + (i % 97)),
  })
  activity.cadence = new Float32Array(n).fill(88)
  activity.temperature = new Float32Array(n).fill(18)
  return activity
}

describe('activity trace performance', () => {
  const activity = longRide()

  it(`builds the trace of a 48-hour ride in under ${BUILD_BUDGET_MS} ms`, () => {
    let streams = 0
    const ms = fastestMs(() => {
      streams = Object.keys(activityTraceOf(activity).streams).length
    })
    expect(streams).toBe(6)
    expect(ms).toBeLessThan(BUILD_BUDGET_MS)
  })

  it(`checks and copies the trace of a 48-hour ride in under ${PARSE_BUDGET_MS} ms`, () => {
    const trace = activityTraceOf(activity)
    let parsed = 0
    const ms = fastestMs(() => {
      parsed = parseActivityTrace(trace)?.durationS ?? 0
    })
    expect(parsed).toBe(MAX_FILE_SAMPLES)
    expect(ms).toBeLessThan(PARSE_BUDGET_MS)
  })
})
