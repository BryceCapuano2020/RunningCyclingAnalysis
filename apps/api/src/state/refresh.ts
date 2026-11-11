import { StateSnapshotSchema } from '@rca/contract'
import { RESULT_REVISION } from './resultRevision.ts'
import type { StateSnapshot } from '@rca/core/stateSnapshot'
import type { Deps } from '../deps.ts'
import type { Bindings } from '../env.ts'
import { checkR2PutBudget, reserveR2Put } from '../storage.ts'
import { computeFor } from './compute.ts'
import { InputsMoved, readInputs } from './inputs.ts'
import { stateKey } from './key.ts'
import { STATE_CLAIM_SECONDS } from './message.ts'
import { claimCompute, record, releaseClaim } from './record.ts'
import type { JobRow } from './row.ts'
import { contentHash, encodeSnapshot } from './store.ts'

/** What one compute came to. `gone` and `moved` carry no snapshot; the rest do. */
export type Computed =
  | { kind: 'gone' }
  | { kind: 'moved' }
  | { kind: 'busy' } // another compute holds the account's claim
  | {
      /** `unchanged`: the figures match the stored snapshot, so only its day moved. `unstored`: served, not kept. */
      kind: 'written' | 'unchanged' | 'unstored'
      snapshot: StateSnapshot
      hash: string
      nowMs: number
      version: number
      liftRevision: number
    }

/** Whether the account is still there and not being deleted: asked again just before the snapshot is stored. */
async function live(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS ok FROM users WHERE id = ? AND deleting_at IS NULL')
    .bind(userId)
    .first()
  return row !== null
}

/**
 * Computes one account's snapshot from its inputs at one read (`readInputs`) and, when `store` is set, keeps it: the
 * object first, then the row, the old object going after. Without `store` (the stored snapshot is a later Worker's) it
 * touches neither the row nor the bucket and hands the result back. Throws on a failure the caller should retry (R2
 * budget, a D1 error). `before` is the row the caller decided on; the caller holds the isolate's compute lock.
 */
export async function computeAndStore(
  env: Bindings,
  deps: Deps,
  userId: string,
  before: JobRow,
  store: boolean,
  /** The stamp of the account's claim when the caller holds it already (a read takes it before its budget unit is spent). */
  claimed: number | null = null,
): Promise<Computed> {
  const db = env.DB
  if (env.FILES === undefined) throw new Error('state job: no file storage bound')
  if (!store) return compute(env, deps, userId, before, false)
  // Before any digest is read: a ledger that would refuse the snapshot's PUT costs no compute (the retry finds it the same).
  await checkR2PutBudget(db, deps.now(), 0)
  // The same claim a read takes, so the queue and the reads exclude each other across isolates.
  const stamp = claimed ?? (await claimCompute(db, userId, deps.now(), STATE_CLAIM_SECONDS * 1000))
  if (stamp === null) return { kind: 'busy' }
  let done: Computed
  try {
    done = await compute(env, deps, userId, before, true)
  } catch (error) {
    await releaseClaim(db, userId, stamp).catch(() => undefined)
    throw error
  }
  // A read's compute that found a write landed reads again under the same claim (the route stamps it again).
  if (done.kind !== 'moved' || claimed === null) {
    await releaseClaim(db, userId, stamp).catch(() => undefined)
  }
  return done
}

async function compute(
  env: Bindings,
  deps: Deps,
  userId: string,
  before: JobRow,
  store: boolean,
): Promise<Computed> {
  const db = env.DB
  const bucket = env.FILES!
  let inputs
  try {
    inputs = await readInputs(db, userId)
  } catch (error) {
    if (error instanceof InputsMoved) return { kind: 'moved' }
    throw error
  }
  if (inputs === null) return { kind: 'gone' }
  const nowMs = deps.now()
  const snapshot = computeFor(inputs, nowMs)
  // A snapshot this build writes is one it reads: the envelope is the contract's own.
  const envelope = StateSnapshotSchema.safeParse(snapshot)
  if (!envelope.success) throw new Error('state job: snapshot does not fit its envelope')
  const hash = await contentHash(snapshot)
  const done = { snapshot, hash, nowMs, version: inputs.version, liftRevision: inputs.liftRevision }
  if (!store) return { kind: 'unstored', ...done }
  const covered = { version: inputs.version, liftRevision: inputs.liftRevision, nowMs, at: nowMs }
  // The stored object is this build's own only when the row says this revision: a lower one may be an older Worker's
  // object under the same hash, which is written again so its metadata names this revision.
  if (hash === before.snapshot_hash && before.analysis_revision === RESULT_REVISION) {
    await record(db, userId, covered, null, hash)
    return { kind: 'unchanged', ...done }
  }
  const bytes = await encodeSnapshot(snapshot)
  await reserveR2Put(db, deps.now, bytes.byteLength)
  // Compute on read widens the window between the start and here, so the account is asked about again before the put.
  if (!(await live(db, userId))) return { kind: 'gone' }
  await bucket.put(stateKey(userId, hash), bytes, {
    httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip' },
    // The object names its own analysis revision, so a reader can tell one an older Worker wrote (a rollback, a rolling
    // deploy) from the row, which that Worker does not keep.
    customMetadata: { resultRevision: String(RESULT_REVISION) },
  })
  let outcome
  try {
    outcome = await record(db, userId, covered, hash, null)
  } catch (error) {
    // The row did not take it (the account went, say): the object has no owner, so it goes rather than wait for the sweep.
    await bucket.delete(stateKey(userId, hash)).catch(() => undefined)
    throw error
  }
  const { held, prior } = outcome
  if (held === null) {
    // The row is gone (the account was deleted between the check and here): the object has no owner.
    await bucket.delete(stateKey(userId, hash)).catch(() => undefined)
    return { kind: 'gone' }
  }
  // The object the row held before goes in the same job. If a newer job won the row, ours is the one with no owner.
  const stale = held === hash ? prior : hash
  if (stale !== null && stale !== held) await bucket.delete(stateKey(userId, stale))
  return { kind: 'written', ...done }
}
