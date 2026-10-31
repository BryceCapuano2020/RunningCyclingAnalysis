import { localDayOfInstant } from '../calendar'
import { DAY_MS } from '../constants'

/** The weeks a typical training week is averaged over, as Tanda (2011) and most training logs do. */
const VOLUME_WEEKS = 8

/**
 * A typical training week's distance, m: the distance run in the VOLUME_WEEKS ending with the newest run,
 * per week. A shorter history is averaged over the weeks it spans, at least one, so a six-week period is
 * not read as two weeks of nothing.
 */
export function typicalWeeklyDistance(
  runs: readonly { startMs: number; distanceM: number }[],
): number {
  if (runs.length === 0) return 0
  const newest = Math.max(...runs.map((r) => r.startMs))
  const from = newest - VOLUME_WEEKS * 7 * DAY_MS
  const recent = runs.filter((r) => r.startMs > from)
  const earliest = Math.min(...recent.map((r) => r.startMs))
  // The local calendar days from the first run's day to the newest run's day, both counted, in whole weeks
  // rounded up: runs a week apart cover two weeks, and a run every day for four weeks covers four, not five.
  // Days are counted by date, not by hours, so a late run and an early one the next day are two days.
  const days = localDayOfInstant(newest) - localDayOfInstant(earliest) + 1
  const spanned = Math.ceil(days / 7)
  const weeks = Math.max(1, Math.min(VOLUME_WEEKS, spanned))
  return recent.reduce((sum, r) => sum + Math.max(0, r.distanceM), 0) / weeks
}
