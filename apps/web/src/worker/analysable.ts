import { revisionStatus } from '@rca/core/digest/revisions'
import type { ActivityDigest } from '@rca/core/types'

/**
 * Whether the analysis reads a digest: the current model's, or one it reads beside its own. A stale or newer digest
 * is held out (see SessionLibrary), so it is no copy of anything and nothing is a copy of it.
 */
export function isAnalysable(digest: ActivityDigest): boolean {
  const status = revisionStatus(digest.modelRevision)
  return status === 'current' || status === 'compatible'
}
