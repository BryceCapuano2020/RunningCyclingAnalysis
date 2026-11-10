import { StateSnapshotSchema } from '@rca/contract'
import type { Bindings } from '../env.ts'
import type { Deps } from '../deps.ts'
import { checkR2PutBudget, reserveR2Put } from '../storage.ts'
import { computeFor } from './compute.ts'
import { SERVER_STATE_MAX_ACTIVITIES } from './flag.ts'
import { InputsMoved, readInputs } from './inputs.ts'
import { stateKey } from './key.ts'
import { ANALYSIS_REVISION } from '@rca/core/stateSnapshot'
import { STATE_MIN_INTERVAL_SECONDS } from './message.ts'
import { clearPending } from './pending.ts'
import { contentHash, encodeSnapshot } from './store.ts'

/** What one run of an account's job did. */
export type JobOutcome =
  | 'gone' // no account, or one being deleted
  | 'current' // already computed at this version or a later one
  | 'too_large' // more activities than the server computes for; the browser does
  | 'deferred' // computed moments ago; the caller sends one delayed message instead
  | 'moved' // a write landed while reading; its own job follows
  | 'unchanged' // computed, the same figures: the version is recorded and nothing is written
  | 'written' // a new snapshot object, and the old one deleted

interface JobRow {
  library_version: number
  activity_count: number
  computed_version: number | null
  computed_at: number | null
  attempted_at: number | null
  snapshot_hash: string | null
  analysis_revision: number | null
}

async function jobRow(db: D1Database, userId: string): Promise<JobRow | null> {
  return db
    .prepare(
      `SELECT u.library_version, u.activity_count, j.computed_version, j.computed_at, j.attempted_at,
              j.snapshot_hash, j.analysis_revision
       FROM users u LEFT JOIN state_jobs j ON j.user_id = u.id
       WHERE u.id = ? AND u.deleting_at IS NULL`,
    )
    .bind(userId)
    .first<JobRow>()
}

/** Whether the account has inputs no compute covered, and a library the server computes for. */
const dirty = (row: JobRow, maxActivities: number) =>
  !current(row) && row.activity_count <= maxActivities

/**
 * Whether the account's last compute covers its inputs, under this build's analysis: a compute made under another
 * `ANALYSIS_REVISION` (a change to how a figure is worked out) is stale whatever the library version says.
 */
const current = (row: JobRow) =>
  (row.computed_version ?? 0) >= row.library_version &&
  (row.analysis_revision ?? 0) === ANALYSIS_REVISION

/** When the account's last compute began, a failed one included. */
const lastStart = (row: JobRow) =>
  Math.max(row.computed_at ?? -Infinity, row.attempted_at ?? -Infinity)

/** Records that a compute began, before it reads anything, so a compute that then fails still counts for coalescing. */
async function markAttempt(db: D1Database, userId: string, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO state_jobs (user_id, attempted_at) VALUES (?1, ?2)
       ON CONFLICT(user_id) DO UPDATE SET attempted_at = ?2`,
    )
    .bind(userId, now)
    .run()
}

/**
 * Records that the inputs at `version` were computed, and, when `hash` is given, that the snapshot it names is the
 * latest. The snapshot columns move only to a newer version than the stored one, so two jobs that overlap cannot put an
 * older snapshot over a newer one (decision 6), or to this build's analysis revision from another one, whatever the
 * version: a snapshot made under an older analysis is replaced. Returns the hash the row holds afterwards.
 */
async function record(
  db: D1Database,
  userId: string,
  version: number,
  now: number,
  hash: string | null,
): Promise<string | null> {
  const row = await db
    .prepare(
      `INSERT INTO state_jobs (user_id, computed_version, computed_at, snapshot_hash, snapshot_version, analysis_revision)
       VALUES (?1, ?2, ?3, ?4, CASE WHEN ?4 IS NULL THEN 0 ELSE ?2 END, ?5)
       ON CONFLICT(user_id) DO UPDATE SET
         computed_version = CASE WHEN analysis_revision = ?5 THEN max(computed_version, ?2) ELSE ?2 END,
         computed_at = ?3,
         snapshot_hash = CASE
           WHEN ?4 IS NOT NULL AND (snapshot_version < ?2 OR analysis_revision <> ?5) THEN ?4
           ELSE snapshot_hash END,
         snapshot_version = CASE
           WHEN ?4 IS NULL THEN snapshot_version
           WHEN analysis_revision <> ?5 THEN ?2
           ELSE max(snapshot_version, ?2) END,
         analysis_revision = ?5
       RETURNING snapshot_hash`,
    )
    .bind(userId, version, now, hash, ANALYSIS_REVISION)
    .first<{ snapshot_hash: string | null }>()
  return row?.snapshot_hash ?? null
}

/**
 * Computes one account's snapshot if its inputs have moved since the last compute, and stores it only if the figures
 * changed. The same `AnalysisSession.loadDigests` path the browser runs, on the digests D1 holds. Throws on a failure the
 * Queue should retry (R2 budget, a D1 error). The caller has a message for the account in hand: the job clears the
 * account's pending marker (pending.ts) unless it defers.
 */
export async function runStateJob(
  env: Bindings,
  deps: Deps,
  userId: string,
  /** The library size the job computes for: the limit, unless a measurement raises it. */
  { maxActivities = SERVER_STATE_MAX_ACTIVITIES }: { maxActivities?: number } = {},
): Promise<JobOutcome> {
  const db = env.DB
  const bucket = env.FILES
  if (bucket === undefined) throw new Error('state job: no file storage bound')
  // Coalescing first, before the marker is touched: the last compute began too recently for another (a burst of writes,
  // an import, a retry waiting out a failure), so the caller sends one delayed message if no other is on its way. A failed
  // compute counts as recent too, so a burst of messages after a failure waits rather than computing once per message.
  const first = await jobRow(db, userId)
  if (first === null) return 'gone'
  if (
    dirty(first, maxActivities) &&
    deps.now() - lastStart(first) < STATE_MIN_INTERVAL_SECONDS * 1000
  ) {
    return 'deferred'
  }
  // The message has arrived: a write from here sends its own, and one the marker held back is in the row read next.
  await clearPending(db, userId)
  const before = await jobRow(db, userId)
  if (before === null) return 'gone'
  if (current(before)) return 'current'
  if (before.activity_count > maxActivities) return 'too_large'
  // Before any digest is read: a ledger that would refuse the snapshot's PUT costs no compute (the retry finds it the same).
  await checkR2PutBudget(db, deps.now(), 0)
  await markAttempt(db, userId, deps.now())
  let inputs
  try {
    inputs = await readInputs(db, userId)
  } catch (error) {
    if (error instanceof InputsMoved) return 'moved'
    throw error
  }
  if (inputs === null) return 'gone'
  const nowMs = deps.now()
  const snapshot = computeFor(inputs, nowMs)
  // A snapshot this build writes is one it reads: the envelope is the contract's own.
  const envelope = StateSnapshotSchema.safeParse(snapshot)
  if (!envelope.success) throw new Error('state job: snapshot does not fit its envelope')
  const hash = await contentHash(snapshot)
  if (hash === before.snapshot_hash) {
    await record(db, userId, inputs.version, nowMs, null)
    return 'unchanged'
  }
  const bytes = await encodeSnapshot(snapshot)
  await reserveR2Put(db, deps.now, bytes.byteLength)
  await bucket.put(stateKey(userId, hash), bytes, {
    httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip' },
    // The object names its own analysis revision, so a reader can tell one an older Worker wrote (a rollback, a rolling
    // deploy) from the row, which that Worker does not keep.
    customMetadata: { analysisRevision: String(ANALYSIS_REVISION) },
  })
  let held: string | null
  try {
    held = await record(db, userId, inputs.version, nowMs, hash)
  } catch (error) {
    // The row did not take it (the account went, say): the object has no owner, so it goes rather than wait for the sweep.
    await bucket.delete(stateKey(userId, hash)).catch(() => undefined)
    throw error
  }
  // The old object goes in the same job. If a newer job won the row, ours is the one with no owner.
  const stale = held === hash ? before.snapshot_hash : hash
  if (stale !== null && stale !== held) await bucket.delete(stateKey(userId, stale))
  return 'written'
}
