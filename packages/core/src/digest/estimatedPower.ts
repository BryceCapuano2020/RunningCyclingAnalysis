import { DEFAULT_BIKE_MODEL } from '../constants'
import { ridePowerCeilingWkg } from '../curves'
import type { ActivityDigest } from '../types'
import type { Masses } from './masses'
import { powerAt } from './terms'

/**
 * A ride without a power meter has its power estimated from its speed and the climbs (the point's `terms`). A motor
 * adds speed on a climb that the rider did not make, so an assisted bike logged as a ride reads as power no rider holds.
 * The meter's own ceiling (see implausiblePower) is applied to those estimates too, priced with the default bike model so
 * the check does not wait for a library to fit one. This reads what the estimate needs; it does not say why.
 */
export interface EstimatedPower {
  /** The length of the effort whose estimated power is furthest over the ceiling, s. */
  durationS: number
  /** The power that estimate needs, W/kg. */
  wkg: number
}

// A digest never changes and the masses are fixed for it; the answer is kept for the masses it was last asked at.
const kept = new WeakMap<
  object,
  { bodyKg: number; totalKg: number; found: EstimatedPower | null }
>()

/**
 * The effort of a ride whose power is estimated that needs more than riders hold at its length, the one furthest over
 * the ceiling; undefined when none does, for a ride with a meter, and for a run.
 */
export function estimatedPowerOver(
  digest: Pick<ActivityDigest, 'curve' | 'sport' | 'startMs'>,
  masses: Masses,
): EstimatedPower | undefined {
  if (digest.sport !== 'ride') return undefined
  const bodyKg = masses.bodyKg(digest)
  const totalKg = masses.totalKg(digest)
  const held = kept.get(digest)
  if (held !== undefined && held.bodyKg === bodyKg && held.totalKg === totalKg) {
    return held.found ?? undefined
  }
  let found: EstimatedPower | null = null
  let worst = 1
  for (const point of digest.curve) {
    if (point.terms === null) continue
    const wkg = powerAt(point.terms, totalKg, DEFAULT_BIKE_MODEL) / bodyKg
    const over = wkg / ridePowerCeilingWkg(point.durationS)
    if (Number.isFinite(over) && over > worst) {
      worst = over
      found = { durationS: point.durationS, wkg }
    }
  }
  kept.set(digest, { bodyKg, totalKg, found })
  return found ?? undefined
}
