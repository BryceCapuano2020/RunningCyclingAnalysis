import { describe, expect, it } from 'vitest'
import { MAX_FILE_SAMPLES } from '../import/result'
import { airDensity, airDensityStream } from './air'

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

describe('airDensityStream performance', () => {
  it('builds the stream of a 48-hour activity held at one altitude in under 2.5 ms', () => {
    const n = MAX_FILE_SAMPLES
    const activity = {
      n,
      altitude: new Float64Array(n).fill(412.6),
      hasAltitude: true,
      indoor: false,
    }
    expect(airDensityStream(activity).every((rho) => rho === airDensity(412.6))).toBe(true)
    // One power per sample and a median of every altitude, none of it missing, took about 11 ms.
    expect(fastestMs(() => airDensityStream(activity))).toBeLessThan(2.5)
  })
})
