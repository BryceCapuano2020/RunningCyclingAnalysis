import { describe, expect, it } from 'vitest'
import { MAX_FILE_SAMPLES } from '../import/result'
import { countKept, movingMask } from './masks'

/** The fastest of several runs, ms, so neither the cold first run nor a stray pause counts. */
function fastestMs(run: () => void): number {
  let fastest = Infinity
  for (let i = 0; i < 7; i++) {
    const start = performance.now()
    run()
    fastest = Math.min(fastest, performance.now() - start)
  }
  return fastest
}

describe('moving mask performance', () => {
  it('counts the moving seconds of a 48-hour activity with a pause and a gap in under 3 ms', () => {
    const n = MAX_FILE_SAMPLES
    const activity = {
      n,
      paused: new Uint8Array(n).fill(1, 0, 600),
      unrecorded: new Uint8Array(n).fill(1, 3600, 4200),
    }
    expect(countKept(movingMask(activity))).toBe(n - 1200)
    // A callback per sample, as TypedArray.from with a map function makes, took about 18 ms.
    expect(fastestMs(() => countKept(movingMask(activity)))).toBeLessThan(3)
  })
})
