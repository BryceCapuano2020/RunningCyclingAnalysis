/**
 * Whether a lift's estimate moved between two periods of the same length (docs/design/e1rm.md, section 10).
 * Each period is read from its own sessions only, so the two windows never share one. The two estimates
 * share most of their systematic error, so the comparison uses only what they do not share.
 */
import { civilOfDay } from '../calendar'
import { CHANGE_MEAN_R_GUARD, CHANGE_Z } from './constants'
import { dayOfLiftDate, estimateLift } from './estimate'
import type { LiftEstimate, SystematicTerms } from './estimate'
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
  return { change: classify(now, before), now, before }
}

/** The rule of section 10 on two estimates. */
function classify(now: LiftEstimate, before: LiftEstimate): LiftChange {
  if (Math.abs(now.meanR - before.meanR) > CHANGE_MEAN_R_GUARD) return 'no clear change'
  let variance = now.ind ** 2 + before.ind ** 2
  for (const k of Object.keys(now.terms) as (keyof SystematicTerms)[]) {
    variance += (now.terms[k] - before.terms[k]) ** 2
  }
  const bar = CHANGE_Z * Math.sqrt(variance)
  const moved = Math.log(now.point0 / before.point0)
  // The page shows the clamped points: a direction they contradict is not named.
  if (moved > bar && now.point > before.point) return 'up'
  if (moved < -bar && now.point < before.point) return 'down'
  return 'no clear change'
}
