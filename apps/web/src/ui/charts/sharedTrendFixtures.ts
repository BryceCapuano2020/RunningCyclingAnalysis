import { DAY_MS } from '@rca/core/constants'
import type { SharedWeek } from './gradeTrend'

/** Sunday 7 January 2024, 23:59:59.999 UTC. */
const FIRST_END = Date.UTC(2024, 0, 8) - 1

/** A week of a shared trend, by its index from the first: its two values, with the ride's range 3 points either side. */
export function week(index: number, run: number | null, ride: number | null): SharedWeek {
  return {
    endMs: FIRST_END + index * 7 * DAY_MS,
    run,
    ride,
    rideLow: ride === null ? null : ride - 0.03,
    rideHigh: ride === null ? null : ride + 0.03,
    runCount: run === null ? 0 : 2,
    rideCount: ride === null ? 0 : 1,
  }
}
