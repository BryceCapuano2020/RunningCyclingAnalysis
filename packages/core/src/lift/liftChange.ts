/**
 * Whether a lift's estimate moved between two periods of the same length (research note section 7): up or
 * down only when the two ranges do not overlap.
 */
import { civilOfDay } from '../calendar'
import { dayOfLiftDate, estimateLift } from './estimate'
import type { LiftEstimate } from './estimate'
import type { LiftSet } from './types'

export type LiftChange = 'up' | 'down' | 'no clear change'

export interface LiftChangeResult {
  change: LiftChange
  /** The estimate at the end of the period. */
  now: LiftEstimate
  /** The estimate at the end of the previous period of the same length. */
  before: LiftEstimate
}

function dateOfDay(day: number): string {
  const { year, month, date } = civilOfDay(day)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`
}

/**
 * The period is the `days` days ending on `end` (YYYY-MM-DD); the previous one ends `days` days before.
 * Null when either end has no estimate.
 */
export function liftChange(
  sets: readonly LiftSet[],
  end: string,
  days: number,
): LiftChangeResult | null {
  const now = estimateLift(sets, end)
  const before = estimateLift(sets, dateOfDay(dayOfLiftDate(end) - days))
  if (!now || !before) return null
  const change = now.low > before.high ? 'up' : now.high < before.low ? 'down' : 'no clear change'
  return { change, now, before }
}
