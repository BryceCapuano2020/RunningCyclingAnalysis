import type { ActivityDigest } from '../types'
import type { DirectConsumer } from './consumers'

/**
 * What a model revision does to the digests of the one before it.
 * - `additive`: only optional fields are new; older digests analyse as they are.
 * - `mixable`: values change a little; older digests are read beside new ones, marked as the previous model.
 * - `exclusive`: values change enough that the two must not be combined; older digests are held out until
 *   they are rebuilt.
 */
/** A field of the digest. A declaration can only name one that exists, so a field is added to the type first. */
export type DigestField = keyof ActivityDigest & string

export type RevisionKind = 'additive' | 'mixable' | 'exclusive'

export interface RevisionDeclaration {
  revision: number
  /** How digests of the previous revision relate to this one. */
  kind: RevisionKind
  /** Optional digest fields first written by this revision. The reader keeps a field only if it lists it (digestFields.test.ts). */
  adds: readonly DigestField[]
  /** Fields whose values mean something different from this revision on. */
  changes: readonly DigestField[]
  /** Consumers whose output moves; comparisons across this revision are not made. Read for `mixable` only. */
  affects: readonly DirectConsumer[]
  /** Under `mixable`: consumers that read current digests only. */
  holdsBack?: readonly DirectConsumer[]
  /** Under `mixable`: the id of the study test that measures it. */
  bound?: string
}

export type RevisionStatus = 'current' | 'compatible' | 'stale' | 'newer'

/**
 * Revisions 1 to 6 predate this table. They were each a full rewrite of what the digests mean, so they are
 * declared `exclusive`; which fields each one added was not recorded, so `adds` and `changes` start at 7.
 */
const exclusive = (revision: number): RevisionDeclaration => ({
  revision,
  kind: 'exclusive',
  adds: [],
  changes: [],
  affects: [],
})

/** Every revision, oldest first, from 1 without gaps. The last entry is the one this build writes. */
export const REVISIONS: readonly RevisionDeclaration[] = [1, 2, 3, 4, 5, 6].map(exclusive)

/** The declaration of a revision, or undefined when the table has none (before 1, or past the current). */
function declarationOf(
  revision: number,
  table: readonly RevisionDeclaration[],
): RevisionDeclaration | undefined {
  return table.find((declaration) => declaration.revision === revision)
}

/** The declarations a digest of `revision` has to cross to reach the current one, oldest first. */
export function stepsFrom(
  revision: number,
  table: readonly RevisionDeclaration[] = REVISIONS,
): RevisionDeclaration[] {
  return table.filter((declaration) => declaration.revision > revision)
}

/**
 * How a digest of `revision` stands against the current one. The one place revisions are compared.
 * A revision the table does not know, below the first, is stale: it is older than anything declared.
 */
export function revisionStatus(
  revision: number,
  table: readonly RevisionDeclaration[] = REVISIONS,
): RevisionStatus {
  const current = table[table.length - 1]?.revision ?? 0
  if (revision === current) return 'current'
  if (revision > current) return 'newer'
  for (const step of stepsFrom(revision, table)) {
    if (step.kind === 'exclusive') return 'stale'
  }
  return declarationOf(revision, table) === undefined ? 'stale' : 'compatible'
}

/** The revision this build writes: the last declared. */
export function currentRevision(table: readonly RevisionDeclaration[] = REVISIONS): number {
  return table[table.length - 1]?.revision ?? 0
}

/** The lowest revision whose status is `compatible` or `current`: the oldest the server accepts. */
export function oldestCompatibleRevision(
  table: readonly RevisionDeclaration[] = REVISIONS,
): number {
  for (const declaration of table) {
    if (revisionStatus(declaration.revision, table) !== 'stale') return declaration.revision
  }
  return currentRevision(table)
}

export const OLDEST_COMPATIBLE_REVISION = oldestCompatibleRevision()

/** The revision that first wrote `field`, or null when no declaration adds it. */
function addedAt(field: DigestField, table: readonly RevisionDeclaration[]): number | null {
  return table.find((declaration) => declaration.adds.includes(field))?.revision ?? null
}

/**
 * Whether the digest's model records `field`. Absent on a digest that knows the field means the file has
 * none; absent on one that does not know it means that model did not record it.
 */
export function knows(
  digest: Pick<ActivityDigest, 'modelRevision'>,
  field: DigestField,
  table: readonly RevisionDeclaration[] = REVISIONS,
): boolean {
  const revision = addedAt(field, table)
  return revision === null || digest.modelRevision >= revision
}

/** The optional fields a rebuild of this digest would add. */
export function missingFields(
  digest: Pick<ActivityDigest, 'modelRevision'>,
  table: readonly RevisionDeclaration[] = REVISIONS,
): readonly DigestField[] {
  return stepsFrom(digest.modelRevision, table).flatMap((step) => step.adds)
}
