import { revisionStatus } from '@rca/core/digest/revisions'
import { HttpError } from '../../errors.ts'

/**
 * The model revision a create body claims for its digest. A digest with no usable revision is the oldest:
 * revision 1. A body with no digest object is not read here; the schema refuses it as malformed.
 */
function claimedRevision(body: unknown): number | null {
  if (typeof body !== 'object' || body === null) return null
  const digest = (body as { digest?: unknown }).digest
  if (typeof digest !== 'object' || digest === null) return null
  const revision = (digest as { modelRevision?: unknown }).modelRevision
  return typeof revision === 'number' && Number.isInteger(revision) && revision >= 1 ? revision : 1
}

/**
 * Refuses a digest made by an older, incompatible model, before the schema reads it. The app that sent it
 * is out of date, so the answer says to reload; a newer revision is the schema's refusal, as before.
 */
export function requireCurrentRevision(body: unknown): void {
  const revision = claimedRevision(body)
  if (revision !== null && revisionStatus(revision) === 'stale') {
    throw new HttpError(
      409,
      'app_outdated',
      'This version of the app is out of date. Reload the page to update it.',
    )
  }
}
