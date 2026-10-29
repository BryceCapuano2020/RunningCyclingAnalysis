import { formatCount } from '../format/count'
import { formatMonth } from '../format/date'
import type { DetailCoverage } from './model'

/**
 * Whether this browser holds an activity's detailed readings: true or false once storage has said,
 * null before that or while a sample shows. An account's saved original file can give the detail back.
 */
export function hasDetail(detail: DetailCoverage | null, activityId: string): boolean | null {
  return detail === null ? null : detail.ids.has(activityId)
}

/**
 * The line a summary adds when the readings kept are the newest of more activities: how many, since
 * when, and what the older ones keep. Null when every activity has its readings, or nothing is known.
 */
export function detailCoverageLine(
  detail: DetailCoverage | null,
  activities: number,
): { short: string; full: string } | null {
  if (detail === null || detail.oldestStartMs === null) return null
  const kept = detail.ids.size
  if (kept === 0 || kept >= activities) return null
  const newest = kept === 1 ? 'your newest activity' : `your newest ${formatCount(kept)} activities`
  return {
    short: `Detail kept for the newest ${formatCount(kept)}`,
    full: `Detailed readings kept for ${newest} (since ${formatMonth(detail.oldestStartMs, true)}). Older ones keep their summaries, bests and splits.`,
  }
}
