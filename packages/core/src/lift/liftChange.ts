/**
 * Whether a lift's estimate moved between two periods of the same length (research note section 7): up or
 * down only when the two ranges do not overlap. Each period is read from its own sessions only, so the
 * two windows never share one.
 */
import { civilOfDay } from '../calendar'
import { dayOfLiftDate, estimateLift } from './estimate'
import type { LiftEstimate } from './estimate'
import type { LiftSet } from './types'

export type LiftChange = 'up' | 'down' | 'no clear change'

export interface LiftChangeResult {
  change: LiftChange
  /** The estimate from the sessions of the period ending on `end`. */
  now: LiftEstimate
  /** The estimate from the sessions of the previous period of the same length. */
  before: LiftEstimate
}

function dateOfDay(day: number): string {
  const { year, month, date } = civilOfDay(day)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`
}

/** The estimate at the end of the `days` days ending on `endDay`, from the sets inside them. */
function periodEstimate(
  sets: readonly LiftSet[],
  endDay: number,
  days: number,
): LiftEstimate | null {
  const inside = sets.filter((s) => {
    const d = dayOfLiftDate(s.date)
    return d <= endDay && d > endDay - days
  })
  return estimateLift(inside, dateOfDay(endDay))
}

/**
 * The period is the `days` days ending on `end` (YYYY-MM-DD); the previous one is the `days` before it. Null
 * unless each period has a session with an eligible set.
 */
export function liftChange(
  sets: readonly LiftSet[],
  end: string,
  days: number,
): LiftChangeResult | null {
  const endDay = dayOfLiftDate(end)
  const now = periodEstimate(sets, endDay, days)
  const before = periodEstimate(sets, endDay - days, days)
  if (!now || !before) return null
  const change = now.low > before.high ? 'up' : now.high < before.low ? 'down' : 'no clear change'
  return { change, now, before }
}
