import '../../../zodConfig.ts'
import { z } from 'zod'
import { pathSegments, tryReadDigest } from '@rca/core/digest/test/frozen/r1'
import type { ActivityDigest, DigestView } from '@rca/core/digest/test/frozen/r1'

/**
 * Frozen: the digest schemas of the rollback floor W1, the Worker of release R1, over the frozen reader in
 * packages/core/src/digest/test/frozen/r1. R1 reads every field and the quality kind revision 7 writes, and
 * writes none; it takes revision 7 for a newer app's. Do not edit it to follow the current rules. When the
 * rollback floor moves again, replace it with the contract of the new floor.
 */
function digestSchema(view: DigestView) {
  return z.unknown().transform((value, ctx): ActivityDigest => {
    const read = tryReadDigest(value, view)
    if (read.ok) return read.digest
    ctx.addIssue({ code: 'custom', path: pathSegments(read.path), message: read.problem })
    return z.NEVER
  })
}

export const R1CreateDigestSchema = digestSchema('create')
export const R1StoredDigestSchema = digestSchema('stored')
