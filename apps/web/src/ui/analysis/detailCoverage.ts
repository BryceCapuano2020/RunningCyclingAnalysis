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

/**
 * What the lists may judge detail by: this browser's own coverage, or null for a library it does not describe. A
 * signed-in library can read older detail back from a saved original, and the sample has detail for every activity,
 * since each recording is drawn again when it is opened. What a stored device library held before the sample was
 * loaded is not the sample's, and would tag every sample row "No detail".
 */
export function judgedDetail(
  detail: DetailCoverage | null,
  library: { isSample: boolean; signedIn: boolean },
): DetailCoverage | null {
  return library.isSample || library.signedIn ? null : detail
}
