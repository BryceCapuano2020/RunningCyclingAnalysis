import { mulberry32 } from '../../math'
import type { Activity } from '../../types'
import { syntheticActivity } from './syntheticActivity'

/**
 * Synthetic runs that each exercise one revision-7 change, so a test can digest them with the gate on and
 * off. Seeded; no real data.
 */

/** A steady outdoor run of `n` seconds at `speed` m/s with a small seeded wobble in heart rate. */
function steadyRun(id: string, n: number, speed: number, seed: number): Activity {
  const rand = mulberry32(seed)
  const heartRate = new Float64Array(n)
  let hr = 150
  for (let i = 0; i < n; i++) {
    hr += (150 - hr) * 0.05 + (rand() - 0.5) * 2
    heartRate[i] = Math.round(hr)
  }
  return syntheticActivity({ id, n, speed: new Float64Array(n).fill(speed), heartRate })
}

/** Run cadence as a FIT file writes it: strides doubled, so only even steps a minute. */
export function evenSteps(center: number, jitter: number, n: number, seed: number): Float32Array {
  const rand = mulberry32(seed)
  return Float32Array.from(
    { length: n },
    () => 2 * Math.round((center + (rand() - 0.5) * jitter) / 2),
  )
}

/** A slow GPX run: 40 minutes at 1.63 m/s (16:27 a mile) with `<cad>` of unknown unit around `cadence`. */
export function gpxRun(cadence: number, seed = 5): Activity {
  const run = steadyRun('gpx-run', 2400, 1.63, seed)
  const rand = mulberry32(seed + 1)
  run.cadence = Float32Array.from({ length: run.n }, () => Math.round(cadence + (rand() - 0.5) * 6))
  run.cadenceUnit = 'unknown'
  return run
}

/** A FIT run whose heart-rate strap repeats the cadence for `lockS` seconds from second 600. */
export function lockedRun(lockS: number, seed = 9): Activity {
  const run = steadyRun('locked-run', 1800, 3, seed)
  const cadence = evenSteps(172, 6, run.n, seed + 1)
  run.cadence = cadence
  run.cadenceUnit = 'steps/min'
  for (let i = 600; i < 600 + lockS; i++) run.heartRate[i] = cadence[i]!
  return run
}

/** A 40 minute run whose watch recorded a temperature that warms from 12 to 20 degrees, with a 3 minute sunny spike. */
export function warmRun(seed = 13): Activity {
  const run = steadyRun('warm-run', 2400, 3, seed)
  run.temperature = Float32Array.from({ length: run.n }, (_, i) =>
    i >= 1500 && i < 1680 ? 38 : 12 + (8 * i) / run.n,
  )
  return run
}

/** A power-meter ride of 40 minutes with a temperature of 25 degrees recorded on half the seconds. */
export function warmRide(seed = 17): Activity {
  const rand = mulberry32(seed)
  const n = 2400
  const power = Float64Array.from({ length: n }, () => 200 + Math.round((rand() - 0.5) * 20))
  const ride = syntheticActivity({ id: 'warm-ride', sport: 'ride', n, power })
  ride.temperature = Float32Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 25 : NaN))
  return ride
}
