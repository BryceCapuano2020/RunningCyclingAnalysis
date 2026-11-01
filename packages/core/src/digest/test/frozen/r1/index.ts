/**
 * The digest readers as the rollback floor W1 reads them: a copy of the reader (the device library's
 * parseDigest and the one reader behind the create and stored schemas) as release R1 shipped it, which
 * reads every field and the quality kind revision 7 writes but writes none. Do not edit it to follow the
 * current rules, and do not import it from product code. Its constants are copied into constants.ts, so a
 * later change to the live ones cannot move it; the types come from the live ones, and a change to one is
 * a compile error here. It is here so a test can ask whether a digest the current code accepts is one the
 * floor can still read back after a rollback. Taken from main 006deb4b, which reads six record distances (the marathon) and writes no revision 7. W1 is the last main
 * commit before F merges: if main moves before step 1 deploys, diff the readers against this copy and refresh it.
 */
export { parseDigest } from './serialize'
export { readDigest } from './readDigest'
export { pathSegments, readIdentity, tryReadDigest } from './readResult'
export type { DigestView } from './readRules'
export type { ActivityDigest, QualityKind, QualityFlag } from './types'
