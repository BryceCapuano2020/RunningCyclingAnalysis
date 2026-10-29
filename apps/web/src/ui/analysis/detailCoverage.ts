import { formatCount } from '../format/count'
import { formatMonth } from '../format/date'
import type { DetailCoverage } from './model'

/**
 * The line a summary adds when readings are kept for only some activities: how many, how far back the
 * newest go, and what the others keep. An oversized or outranked activity can be missing among the newest,
 * so it does not say "the newest N". Null when every activity has its readings, or nothing is known.
 */
export function detailCoverageLine(
  detail: DetailCoverage | null,
  activities: number,
): { short: string; full: string } | null {
  if (detail === null || detail.oldestStartMs === null) return null
  const kept = detail.ids.size
  if (kept === 0 || kept >= activities) return null
  const of = kept === 1 ? '1 of your activities' : `${formatCount(kept)} of your activities`
  return {
    short: `Detail kept for ${formatCount(kept)} of ${formatCount(activities)}`,
    full: `Detailed readings kept for ${of}, the newest back to ${formatMonth(detail.oldestStartMs, true)}. Others keep their summaries, bests and splits.`,
  }
}
