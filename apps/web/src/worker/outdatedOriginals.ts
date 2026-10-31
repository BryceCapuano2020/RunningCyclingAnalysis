import type { ActivityRecord } from '@rca/contract'
import { revisionStatus } from '@rca/core/digest/revisions'
import type { AnalysisSession } from '@rca/core/session'

/**
 * How many outdated saved activities a rebuild can update: the session counts them as outdated, and
 * their original file is held and was not found unmatched by a rebuild. The page offers Update now
 * for this many, and asks for the files of the rest.
 */
export function outdatedWithOriginal(
  session: Pick<AnalysisSession, 'hasOutdated'>,
  savedRecords: ReadonlyMap<string, ActivityRecord>,
  unmatchedOriginals: ReadonlySet<string>,
): number {
  let count = 0
  for (const record of savedRecords.values()) {
    const { digest } = record
    if (
      revisionStatus(digest.modelRevision) === 'stale' &&
      record.hasFile &&
      !unmatchedOriginals.has(record.id) &&
      session.hasOutdated(digest.sport, digest.startMs)
    )
      count++
  }
  return count
}
