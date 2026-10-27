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
  // Runs a week apart span one week each, so eight weekly runs are eight weeks, not seven.
  const spanned = Math.round((newest - earliest) / (7 * DAY_MS)) + 1
  const weeks = Math.max(1, Math.min(VOLUME_WEEKS, spanned))
  return recent.reduce((sum, r) => sum + Math.max(0, r.distanceM), 0) / weeks
}
