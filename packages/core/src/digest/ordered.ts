import type { ActivityDigest } from '../types'
import { MODEL_REVISION } from './modelRevision'

/** Orders digests by start time, then id, so results do not depend on the order they arrive in. */
function canonicalOrder(a: ActivityDigest, b: ActivityDigest): number {
  if (a.startMs !== b.startMs) return a.startMs - b.startMs
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * The digests of the active model revision, in canonical order. Mixing revisions would combine
 * stale and current assumptions, so the other revisions are left out everywhere.
 */
export function orderedCurrent(digests: ActivityDigest[]): ActivityDigest[] {
  return digests.filter((digest) => digest.modelRevision === MODEL_REVISION).sort(canonicalOrder)
}
