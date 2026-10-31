import '../../../zodConfig.ts'
import { z } from 'zod'
import { pathSegments, tryReadDigest } from '@rca/core/digest/test/frozen/rev6'
import type { ActivityDigest, DigestView } from '@rca/core/digest/test/frozen/rev6'

/**
 * Frozen: the digest schemas as revision 6 shipped them, over the frozen reader in
 * packages/core/src/digest/test/frozen/rev6. Do not edit it to follow the current rules. A test reads
 * revision-7 digests through it to show what a build before revision 7 does with them.
 */
function digestSchema(view: DigestView) {
  return z.unknown().transform((value, ctx): ActivityDigest => {
    const read = tryReadDigest(value, view)
    if (read.ok) return read.digest
    ctx.addIssue({ code: 'custom', path: pathSegments(read.path), message: read.problem })
    return z.NEVER
  })
}

export const Rev6CreateDigestSchema = digestSchema('create')
export const Rev6StoredDigestSchema = digestSchema('stored')
