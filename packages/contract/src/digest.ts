import './zodConfig.ts'
import { z } from 'zod'
import { pathSegments, tryReadDigest } from '@rca/core/digest/read'
import type { DigestView } from '@rca/core/digest/read'
import type { ActivityDigest } from '@rca/core/types'

/**
 * The digest schemas are thin: the rules for what a digest is live in one reader in @rca/core
 * (packages/core/src/digest/readDigest.ts), which the device library, the API and the signed-in app
 * all call. Zod only carries its verdict into request and response parsing, so a digest cannot be
 * accepted by one of them and refused by another. The bounds are in readLimits.ts, documented in
 * docs/LIMITS.md.
 *
 * Parsing restores NaN, so the output is the in-memory ActivityDigest. Fields the reader does not
 * know are stripped. Every bound applies to every revision: a stored row is read with the same
 * rules, so a revision cannot be used to smuggle in a larger digest.
 */
function digestSchema(view: DigestView) {
  return z.unknown().transform((value, ctx): ActivityDigest => {
    const read = tryReadDigest(value, view)
    if (read.ok) return read.digest
    ctx.addIssue({ code: 'custom', path: pathSegments(read.path), message: read.problem })
    return z.NEVER
  })
}

/** A digest being created (POST /api/activities): every rule. */
export const ActivityDigestSchema = digestSchema('create')

/**
 * An ActivityDigest as read back from a stored row. Rows written by older revisions can miss the
 * create-time rules (a null duration, a curve off the grid), so those rules are relaxed here; the
 * bounds on every number stay, and the arrays may be longer by a fixed factor. A quality kind this
 * build does not know is dropped and the activity kept, so a rollback does not hide activities. See
 * DigestRules in @rca/core for the whole difference.
 */
export const StoredActivityDigestSchema = digestSchema('stored')
