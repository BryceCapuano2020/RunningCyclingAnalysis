import { revisionStatus } from '@rca/core/digest/revisions'
import { HttpError } from '../../errors.ts'

/** A revision a request claims: a whole number from 1, and anything else counts as the oldest, revision 1. */
function asRevision(claimed: unknown): number {
  return typeof claimed === 'number' && Number.isInteger(claimed) && claimed >= 1 ? claimed : 1
}

/**
 * The model revision a create body claims for its digest. A digest with no usable revision is the oldest:
 * revision 1. A body with no digest object is not read here; the schema refuses it as malformed.
 */
function claimedRevision(body: unknown): number | null {
  if (typeof body !== 'object' || body === null) return null
  const digest = (body as { digest?: unknown }).digest
  if (typeof digest !== 'object' || digest === null) return null
  return asRevision((digest as { modelRevision?: unknown }).modelRevision)
}

function outdated(): HttpError {
  return new HttpError(
    409,
    'app_outdated',
    'This version of the app is out of date. Reload the page to update it.',
  )
}

/**
 * Refuses a digest made by an older, incompatible model, before the schema reads it. The app that sent it
 * is out of date, so the answer says to reload; a newer revision is the schema's refusal, as before.
 */
export function requireCurrentRevision(body: unknown): void {
  const revision = claimedRevision(body)
  if (revision !== null && revisionStatus(revision) === 'stale') throw outdated()
}

/**
 * The same refusal for a label change, which names the revision of the digest the client read. A body
 * with no list of changes, or an entry that is not an object, is left to the schema as malformed.
 */
export function requireCurrentLabelRevisions(body: unknown): void {
  if (typeof body !== 'object' || body === null) return
  const labels = (body as { labels?: unknown }).labels
  if (!Array.isArray(labels)) return
  for (const entry of labels) {
    if (typeof entry !== 'object' || entry === null) continue
    const revision = asRevision((entry as { revision?: unknown }).revision)
    if (revisionStatus(revision) === 'stale') throw outdated()
  }
}
