import { describe, expect, it } from 'vitest'
import { MAX_FILE_SAMPLES } from '../import/result'
import { fastestMs } from '../test/timing'
import { detectIntervals } from './intervals'
import type { ActivityTrace } from './types'

/**
 * Looking for efforts in the longest file the importer accepts, 48 hours of power with a set of efforts in
 * it, takes about 20 ms: one pass for the smoothed readings and a sort for the split. The budget is five times
 * that, so a pass per sample of the window, or a split tried at every reading, fails it on a loaded runner.
 */
const BUDGET_MS = 100

describe('interval detection performance', () => {
  const n = MAX_FILE_SAMPLES
  const trace: ActivityTrace = {
    version: 1,
    activityId: 'long',
    sport: 'ride',
    durationS: n,
    distance: new Float64Array(n),
    paused: new Uint8Array(n),
    unrecorded: new Uint8Array(n),
    streams: {
      power: Float32Array.from({ length: n }, (_, i) =>
        // Each hour has four efforts of two minutes, a rest of two minutes after each, from minute 30.
        i % 3600 >= 1800 && i % 3600 < 2760 && (i % 3600) % 240 < 120
          ? 300 + (i % 11)
          : 150 + (i % 13),
      ),
    },
    laps: [],
  }

  it(`finds the efforts of a 48-hour ride in under ${BUDGET_MS} ms`, () => {
    let found = 0
    const ms = fastestMs(() => {
      found = detectIntervals(trace).length
    })
    expect(found).toBeGreaterThan(150)
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})
