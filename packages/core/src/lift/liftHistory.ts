/**
 * The estimate at each session date of one lift, for the chart. Each point is `estimateLift` as of that
 * date, so it uses the 56 days up to it and nothing later.
 */
import { dayOfLiftDate, estimateLift } from './estimate'
import { WINDOW_DAYS } from './constants'
import { repsToFailure } from './setEstimate'
import type { LiftSet } from './types'

export interface LiftHistoryPoint {
  /** Local date of a session with an eligible set, YYYY-MM-DD. */
  date: string
  point: number
  low: number
  high: number
  /** The heaviest working set in the window, kg. */
  floor: number
}

/** Pass the sets of one lift. Dates ascend; a date with no eligible set has no point. */
export function liftHistory(sets: readonly LiftSet[]): LiftHistoryPoint[] {
  const rows = sets.map((s) => ({ s, day: dayOfLiftDate(s.date) })).sort((a, b) => a.day - b.day)
  const dates = [...new Set(rows.filter((r) => repsToFailure(r.s) !== null).map((r) => r.s.date))]
  const out: LiftHistoryPoint[] = []
  // Only the 56 days up to a date can move its estimate, so each call sees just those.
  let from = 0
  let to = 0
  for (const date of dates) {
    const day = dayOfLiftDate(date)
    while (to < rows.length && (rows[to] as { day: number }).day <= day) to++
    while (from < to && (rows[from] as { day: number }).day <= day - WINDOW_DAYS) from++
    const e = estimateLift(
      rows.slice(from, to).map((r) => r.s),
      date,
    )
    if (e) out.push({ date, point: e.point, low: e.low, high: e.high, floor: e.floor.loadKg })
  }
  return out
}
