import { DAY_MS } from '../../constants'
import { MONDAY } from '../../digest/test/sameHeartRateFixture'
import type { ActivityDigest } from '../../types'
import { fitnessStatuses } from '../compute'
import { rideLibrary } from './rideSim'
import type { RideSpec } from './rideSim'

const WEEK_MS = 7 * DAY_MS
const NONE: ReadonlySet<string> = new Set()

/** Weeks of virtual-power rides before the meter, so the athlete's wander is running when the meter arrives (as in the prototype). */
export const PREFIX_WEEKS = 52

/** A library whose rides before week `meter` carry virtual power, as a rider's do before a power meter. */
export function withMeterFrom(digests: ActivityDigest[], meter: number): ActivityDigest[] {
  return digests.map((d) =>
    d.startMs < MONDAY + meter * WEEK_MS
      ? Object.assign({}, d, { powerSource: 'virtual' as const })
      : d,
  )
}

/** `spec.weeks` weeks on the meter after `PREFIX_WEEKS + lead` virtual ones; `lead` sets the season's phase when the meter arrives. */
export function meterLibrary(
  spec: RideSpec,
  lead = 0,
): { digests: ActivityDigest[]; meter: number } {
  const meter = PREFIX_WEEKS + lead
  return {
    digests: withMeterFrom(rideLibrary({ ...spec, weeks: meter + spec.weeks }), meter),
    meter,
  }
}

/**
 * One rider's first weeks on a power meter, read at each week end from meter week 2: whether the early trend's range cleared
 * zero on two week ends running with the same sign. Stops where the monitor has its baseline and the early trend goes.
 */
export function clearsTwiceRunning(spec: RideSpec, lead = 0): boolean {
  const { digests, meter } = meterLibrary(spec, lead)
  let last = 0
  for (let week = meter + 2; week <= meter + spec.weeks; week++) {
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
export function shareClearing(spec: Omit<RideSpec, 'seed'>, libraries: number, lead = 0): number {
  let hits = 0
  for (let seed = 1; seed <= libraries; seed++) {
    if (clearsTwiceRunning({ ...spec, seed }, lead)) hits++
  }
  return hits / libraries
}
