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
 * Revision 7 is the first entry written with them.
 */
const exclusive = (revision: number): RevisionDeclaration => ({
  revision,
  kind: 'exclusive',
  adds: [],
  changes: [],
  affects: [],
})

/** Every revision, oldest first, from 1 without gaps. The last entry is the one this build writes. */
export const REVISIONS: readonly RevisionDeclaration[] = [
  ...[1, 2, 3, 4, 5, 6].map(exclusive),
  {
    revision: 7,
    // The mixing study (digest/test/mixingStudy.node.test.ts, D12 section 1.8) decides this: with revision 7 and 6 mixed,
    // long best efforts, the weekly bests, the change test's verdicts and the records move by more than a third of the
    // least change the app states (a steep descent now costs more), so a library holds one revision at a time.
    // Zones, thresholds, the lean and the fitness value do not move, which the study also records.
    kind: 'exclusive',
    adds: ['temperature', 'athleteType', 'localDayShift'],
    changes: [
      'flags',
      'flagCounts',
      'maxHeartRate',
      'avgHeartRate',
      'avgPowerW',
      'curve',
      'hrBlocks',
      'calibration',
      'splits',
      'distanceBests',
      'distributions',
      'drift',
      'walkingPace',
    ],
    affects: ['combine', 'trend', 'change', 'records'],
  },
]

/** The table the defaults below read. Only `withRevisionTable` changes it, for tests that need a compatible revision. */
let active: readonly RevisionDeclaration[] = REVISIONS

/**
 * Runs `run` with `table` as the table every function here defaults to, then puts the real one back. The run is
 * synchronous: the table is restored when it returns, so a run that returns a promise would continue under the
 * real table, and is refused. Use `withRevisionTableAsync` for that.
 */
export function withRevisionTable<T>(table: readonly RevisionDeclaration[], run: () => T): T {
  const before = active
  active = table
  try {
    const result = run()
    if (result instanceof Promise) {
      throw new TypeError(
        'withRevisionTable cannot hold a table across an await; use withRevisionTableAsync',
      )
    }
    return result
  } finally {
    active = before
  }
}

/** As `withRevisionTable`, for a run that awaits: the table holds until the promise settles. Do not overlap two. */
export async function withRevisionTableAsync<T>(
  table: readonly RevisionDeclaration[],
  run: () => Promise<T>,
): Promise<T> {
  const before = active
  active = table
  try {
    return await run()
  } finally {
    active = before
  }
}

/** The table in force: the real one, or a test's inside `withRevisionTable`. */
export function activeRevisionTable(): readonly RevisionDeclaration[] {
  return active
}

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
  table: readonly RevisionDeclaration[] = active,
): RevisionDeclaration[] {
  return table.filter((declaration) => declaration.revision > revision)
}

/**
 * How a digest of `revision` stands against the current one. The one place revisions are compared.
 * A revision the table does not know, below the first, is stale: it is older than anything declared.
 */
export function revisionStatus(
  revision: number,
  table: readonly RevisionDeclaration[] = active,
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
export function currentRevision(table: readonly RevisionDeclaration[] = active): number {
  return table[table.length - 1]?.revision ?? 0
}

/** The lowest revision whose status is `compatible` or `current`: the oldest the server accepts. */
export function oldestCompatibleRevision(table: readonly RevisionDeclaration[] = active): number {
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
  table: readonly RevisionDeclaration[] = active,
): boolean {
  const revision = addedAt(field, table)
  return revision === null || digest.modelRevision >= revision
}

/** The optional fields a rebuild of this digest would add. */
export function missingFields(
  digest: Pick<ActivityDigest, 'modelRevision'>,
  table: readonly RevisionDeclaration[] = active,
): readonly DigestField[] {
  return stepsFrom(digest.modelRevision, table).flatMap((step) => step.adds)
}
