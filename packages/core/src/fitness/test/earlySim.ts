import { DAY_MS } from '../../constants'
import { MONDAY } from '../../digest/test/sameHeartRateFixture'
import { fitnessStatuses } from '../compute'
import { rideLibrary } from './rideSim'
import type { RideSpec } from './rideSim'

const WEEK_MS = 7 * DAY_MS
const NONE: ReadonlySet<string> = new Set()

/**
 * One rider's first weeks on a power meter, read at each week end from meter week 2: whether the early trend's range cleared
 * zero on two week ends running with the same sign. Stops where the monitor has its baseline and the early trend goes.
 */
export function clearsTwiceRunning(spec: RideSpec): boolean {
  const digests = rideLibrary(spec)
  let last = 0
  for (let week = 2; week <= spec.weeks; week++) {
    const s = fitnessStatuses(digests, NONE, {
      asOfMs: MONDAY + week * WEEK_MS - 1,
      enabled: { ride: true },
    }).ride
    if (s.early === undefined) {
      if (s.shortfall?.kind !== 'history') break
      last = 0
      continue
    }
    const { low, high } = s.early.change
    const sign = low > 0 ? 1 : high < 0 ? -1 : 0
    if (sign !== 0 && sign === last) return true
    last = sign
  }
  return false
}

/** The share of `libraries` riders, seeds 1 to `libraries`, for which `clearsTwiceRunning` holds. */
export function shareClearing(spec: Omit<RideSpec, 'seed'>, libraries: number): number {
  let hits = 0
  for (let seed = 1; seed <= libraries; seed++) if (clearsTwiceRunning({ ...spec, seed })) hits++
  return hits / libraries
}
