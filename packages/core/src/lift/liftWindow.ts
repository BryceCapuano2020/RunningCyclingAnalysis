/** What a lift's last eight weeks hold, for the Lift page's detail rows (docs/design/e1rm.md, section 2). */
import { WINDOW_DAYS } from './constants'
import { dayOfLiftDate } from './estimate'
import type { LiftSet } from './types'

export interface LiftWindowCounts {
  /** Working sets (not marked warm-up) in the window. */
  sets: number
  /** Days with at least one working set. */
  sessions: number
  /** Those days with at least one working set that carries an RPE. */
  ratedSessions: number
}

/** The counts over the 56 days up to `asOf` (YYYY-MM-DD), inclusive. Pass the sets of one lift. */
export function liftWindowCounts(sets: readonly LiftSet[], asOf: string): LiftWindowCounts {
  const end = dayOfLiftDate(asOf)
  const days = new Map<number, boolean>()
  let count = 0
  for (const s of sets) {
    const day = dayOfLiftDate(s.date)
    if (s.warmup || day > end || day <= end - WINDOW_DAYS) continue
    count += 1
    days.set(day, (days.get(day) ?? false) || s.rpe !== undefined)
  }
  return {
    sets: count,
    sessions: days.size,
    ratedSessions: [...days.values()].filter(Boolean).length,
  }
}
