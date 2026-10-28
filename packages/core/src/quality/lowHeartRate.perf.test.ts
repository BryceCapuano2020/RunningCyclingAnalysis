import { describe, expect, it } from 'vitest'
import { MAX_FILE_SAMPLES } from '../import/result'
import { fastestMs } from '../test/timing'
import type { Activity } from '../types'
import { implausiblyLowHeartRate } from './lowHeartRate'

/**
 * Each stretch is compared with all the others, so the number judged is capped. Judging one every 30 s of a
 * week-long file took over half a second; the cap keeps it to a few tens of milliseconds, and the budget leaves room for a
 * loaded runner while a return to the uncapped count still fails it.
 */
const BUDGET_MS = 120

describe('heart rate too low for the power: cost', () => {
  it(`judges the longest file, with power that varies and a strap that fails, in under ${BUDGET_MS} ms`, () => {
    const n = MAX_FILE_SAMPLES
    const power = new Float64Array(n).map((_, i) => 180 + 60 * Math.sin(i / 900))
    const heartRate = new Float64Array(n).map(
      (_, i) => 100 + 0.25 * (180 + 60 * Math.sin(i / 900) - 180) + 40,
    )
    heartRate.fill(70, Math.floor(n / 2), Math.floor(n / 2) + 3 * 3600)
    const activity = { n, power, heartRate, paused: new Uint8Array(n) } as unknown as Activity
    let runs = 0
    const ms = fastestMs(() => {
      runs = implausiblyLowHeartRate(activity, 30).length
    }, 3)
    // Keeping the result means none of the timed work can be skipped, and the failed strap is still found.
    expect(runs).toBeGreaterThan(0)
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})
