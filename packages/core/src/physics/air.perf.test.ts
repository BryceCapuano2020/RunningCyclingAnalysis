import { describe, expect, it } from 'vitest'
import { MAX_FILE_SAMPLES } from '../import/result'
import { fastestMs } from '../test/timing'
import { airDensity, airDensityStream } from './air'

/**
 * A power per sample and a median of every altitude, none of it missing, took about 11 ms. A
 * varying altitude still needs a power at each change, so it is only about twice as fast as that
 * and is not budgeted: so narrow a margin would not hold on every runner.
 */
const BUDGET_MS = 2.5
const ALTITUDE_M = 412.6

describe('airDensityStream performance', () => {
  it(`builds the stream of a 48-hour activity held at one altitude in under ${BUDGET_MS} ms`, () => {
    const n = MAX_FILE_SAMPLES
    const activity = {
      n,
      altitude: new Float64Array(n).fill(ALTITUDE_M),
      hasAltitude: true,
      indoor: false,
    }
    // Keeping the result means none of the timed work can be skipped.
    let density: Float64Array = new Float64Array(0)
    const ms = fastestMs(() => {
      density = airDensityStream(activity)
    })
    expect(density.every((rho) => rho === airDensity(ALTITUDE_M))).toBe(true)
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})
