import { describe, expect, it } from 'vitest'
import { MAX_FILE_SAMPLES } from '../import/result'
import { fastestMs } from '../test/timing'
import { countKept, movingMask } from './masks'

/** A callback per sample, as TypedArray.from with a map function makes, took about 18 ms. */
const BUDGET_MS = 3

describe('moving mask performance', () => {
  it(`counts the moving seconds of a 48-hour activity with a pause and a gap in under ${BUDGET_MS} ms`, () => {
    const n = MAX_FILE_SAMPLES
    const activity = {
      n,
      paused: new Uint8Array(n).fill(1, 0, 600),
      unrecorded: new Uint8Array(n).fill(1, 3600, 4200),
    }
    // Keeping the result means none of the timed work can be skipped.
    let kept = 0
    const ms = fastestMs(() => {
      kept = countKept(movingMask(activity))
    })
    expect(kept).toBe(n - 1200)
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})
