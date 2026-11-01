import { WALKING_PACE } from '@rca/core/constants'
import type { Sport } from '@rca/core/types'

/**
 * The slowest speed a sport's curve is drawn at, m/s. A run's is the limit the digest sets a walking-pace run aside by:
 * a long window slower than that is a walk, and a curve that dives to it is not a run's best. A ride has no such floor.
 */
const SLOWEST_DRAWN_MS: Record<Sport, number> = { run: WALKING_PACE.maxMovingSpeedMs, ride: 0 }

/**
 * How many leading values of a curve, shortest duration first, a chart draws: through the longest duration whose value is at
 * or above the sport's slowest drawn speed. A value that is missing is skipped over, and none is drawn where none qualifies.
 * Display only: the curve, and every number read from it, stay as the analysis made them.
 */
export function drawnCount(sport: Sport, values: readonly (number | null | undefined)[]): number {
  const floor = SLOWEST_DRAWN_MS[sport]
  return (
    values.findLastIndex((value) => value !== null && value !== undefined && value >= floor) + 1
  )
}
