import { flatSpeedOfWkg, ridePowerOfWkg } from '../display'
import type { ThresholdEstimate } from '../threshold'
import type { Sport } from '../types'
import { paceSeconds } from '../units'
import type { UnitSystem } from '../units'

/**
 * How a sport's threshold moved against the previous period's. `moved.shown` is the difference of the two figures as the page
 * prints them, each taken to the whole unit it shows: watts for a ride, seconds a run's pace gained per km or mile. Positive is
 * more power or a faster pace, so the sign is the same direction in both sports. `none`: the previous period has no estimate.
 */
export type ThresholdChange = { kind: 'none' } | { kind: 'moved'; shown: number }

/** Each sport's printed difference of two thresholds (gross metabolic W/kg), `now` less `before`, in the direction of better. */
const SHOWN: Record<
  Sport,
  (now: number, before: number, massKg: number, units: UnitSystem) => number
> = {
  run: (now, before, _massKg, units) =>
    Math.round(paceSeconds(flatSpeedOfWkg(before), units)) -
    Math.round(paceSeconds(flatSpeedOfWkg(now), units)),
  ride: (now, before, massKg) =>
    Math.round(ridePowerOfWkg(now, massKg)) - Math.round(ridePowerOfWkg(before, massKg)),
}

/**
 * The threshold now against the same figure of the previous period of the same length: each period's estimate is the one
 * `result.runThreshold`/`rideThreshold` holds, so no second formula is applied. A ride is priced at today's mass in both.
 * Both are on the printed scale (a pace to the whole second, watts to the whole watt), so the page never prints a change its
 * two figures do not show.
 */
export function thresholdChange(
  sport: Sport,
  now: ThresholdEstimate,
  before: ThresholdEstimate | null,
  massKg: number,
  units: UnitSystem,
): ThresholdChange {
  if (before === null) return { kind: 'none' }
  return { kind: 'moved', shown: SHOWN[sport](now.value, before.value, massKg, units) }
}
