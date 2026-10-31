/**
 * The digest readers as the rollback target reads them: a copy of the reader (the device library's
 * parseDigest and the one reader behind the create and stored schemas) taken before revision 7's
 * fields existed. Do not edit it to follow the current rules, and do not import it from product code.
 * Its constants are copied into constants.ts, so a later change to the live ones cannot move it; only
 * the shapes of nested types (a curve point, a split) come from the live types, and a change to one of
 * those is a compile error here. It is here so a test can read a revision-7 digest the way a build before revision 7 would, and so
 * the current readers can be held to reading everything revision 6 wrote. Taken from main de7a6cbd.
 */
export { parseDigest } from './serialize'
export { readDigest } from './readDigest'
export { pathSegments, readIdentity, tryReadDigest } from './readResult'
export type { DigestView } from './readRules'
export type { ActivityDigest, QualityKind, QualityFlag } from './types'
