import type { Activity } from '../../types'
import { syntheticActivity } from './syntheticActivity'

/** A run of `n` seconds at 3 m/s that climbs 8% for the first third and then descends at `descent` (rise over run). */
export function hillRun(descent: number, n = 2400): Activity {
  const speed = new Float64Array(n).fill(3)
  const altitude = new Float64Array(n)
  altitude[0] = 500
  for (let i = 1; i < n; i++) {
    altitude[i] = altitude[i - 1]! + (i < n / 3 ? 0.08 : descent) * speed[i]!
  }
  return syntheticActivity({ id: 'hill-run', n, speed, altitude })
}

/** A flat run whose distance stream runs `ratio` times the speed stream's integral. */
export function ratioRun(ratio: number, n = 2400): Activity {
  const run = syntheticActivity({ id: 'ratio-run', n, speed: new Float64Array(n).fill(3) })
  for (let i = 0; i < n; i++) run.distance[i] = i * 3 * ratio
  return run
}
