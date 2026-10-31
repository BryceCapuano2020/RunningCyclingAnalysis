import type { Bindings } from './env.ts'
import type { Deps } from './deps.ts'
import { finishAccountDeletion, pruneAccountTombstones } from './accountDeletion.ts'
import { pruneDailyBudget, pruneUploadSlots } from './budget.ts'
import { pruneIdentityBudget } from './identityBudget.ts'
import { SESSION_ABSOLUTE_MS } from './auth/session.ts'
import { recordDatabaseSize, reserveR2Operation } from './storage.ts'

/** Objects younger than this may still be mid-upload, so the orphan sweep leaves them alone. */
export const ORPHAN_GRACE_MS = 60 * 60 * 1000
/** Keys per listing page. Each page is one D1 query with one bound parameter per key. */
export const ORPHAN_PAGE_SIZE = 90
/** Bounds R2 LIST calls and D1 queries per scheduled run. */
export const ORPHAN_PAGES_PER_RUN = 2
/** Account deletions finished per run. */
export const PENDING_DELETIONS_PER_RUN = 2
/**
 * D1 statements plus R2 calls one scheduled run may issue, within the Workers subrequest limit.
 * A run stops at the call that would exceed this and the next run resumes from the saved state.
 */
export const MAX_MAINTENANCE_OPERATIONS = 45

export interface MaintenanceReport {
  sessions: number
  slots: number
  budgetRows: number
  finishedDeletions: number
  failedDeletions: number
  orphansDeleted: number
  /** Operations issued this run, never more than MAX_MAINTENANCE_OPERATIONS. */
  operations: number
  /** True when the run stopped because it reached MAX_MAINTENANCE_OPERATIONS. */
  budgetReached: boolean
}

const OBJECT_KEY = /^users\/([^/]+)\/([^/]+)$/
const USER_FILES_PREFIX = 'users/'
const R2_CALLS = new Set(['list', 'delete', 'head', 'get', 'put'])

interface Candidate {
  key: string
  userId: string | undefined
  activityId: string | undefined
}

/**
 * The daily maintenance pass, run by the scheduled handler. Every step is bounded, so one run
 * stays within the Workers Free CPU and subrequest limits, and the next run continues the work.
 */
export async function runMaintenance(env: Bindings, deps: Deps): Promise<MaintenanceReport> {
  const now = deps.now()
  const budget = new OperationBudget()
  const bound = meterEnv(env, budget)
  const expired = await within<D1Result | undefined>(undefined, () =>
    deleteExpiredSessions(bound, now),
  )
  // The recorded size feeds the create guard. Refreshing it every run means a value left over the
  // limit cannot block creates indefinitely, even when no later delete records a smaller one.
  if (expired) {
    const size = expired.meta.size_after
    await within(undefined, () => recordDatabaseSize(bound.DB, now, size))
  }
  const sessions = expired?.meta.changes ?? 0
  const slots = await within(0, () => pruneUploadSlots(bound.DB, now))
  // Daily rows, the counts a deleted account left under its identity code, and tombstones past
  // their retention count together.
  const budgetRows =
    (await within(0, () => pruneDailyBudget(bound.DB, now))) +
    (await within(0, () => pruneIdentityBudget(bound.DB, now))) +
    (await within(0, () => pruneAccountTombstones(bound.DB, now)))
  const { finished, failed } = await finishPendingDeletions(bound, deps)
  // The sweep's first statement can reach the cap too, so the whole step is guarded.
  const orphansDeleted = bound.FILES ? await within(0, () => sweepOrphanObjects(bound, deps)) : 0
  return {
    sessions,
    slots,
    budgetRows,
    finishedDeletions: finished,
    failedDeletions: failed,
    orphansDeleted,
    operations: budget.operations,
    budgetReached: budget.reached,
  }
}

/** Thrown by a metered binding once the run has no operations left. Caught by the step that hit it. */
class OperationBudgetExhausted extends Error {
  constructor() {
    super('maintenance operation budget reached')
    this.name = 'OperationBudgetExhausted'
  }
}

class OperationBudget {
  private spent = 0
  reached = false

  get operations(): number {
    return this.spent
  }

  /** Charges count operations before they are issued, so the cap is never exceeded. */
  spend(count: number): void {
    if (this.spent + count > MAX_MAINTENANCE_OPERATIONS) {
      this.reached = true
      throw new OperationBudgetExhausted()
    }
    this.spent += count
  }
}

/** A D1 binding that charges one operation per statement, and each statement of a batch. */
function meterDb(db: D1Database, budget: OperationBudget): D1Database {
  return new Proxy(db, {
    get(target, property) {
      if (property === 'prepare') {
        return (query: string) => {
          budget.spend(1)
          return target.prepare(query)
        }
      }
      if (property === 'batch') {
        return (statements: D1PreparedStatement[]) => {
          budget.spend(statements.length)
          return target.batch(statements)
        }
      }
      const value: unknown = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/** An R2 binding that charges one operation per list, delete, head, get or put call. */
function meterBucket(bucket: R2Bucket, budget: OperationBudget): R2Bucket {
  return new Proxy(bucket, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target)
      if (typeof value !== 'function') return value
      if (typeof property === 'string' && R2_CALLS.has(property)) {
        return (...args: unknown[]) => {
          budget.spend(1)
          return Reflect.apply(value, target, args)
        }
      }
      return value.bind(target)
    },
  })
}

function meterEnv(env: Bindings, budget: OperationBudget): Bindings {
  return {
    ...env,
    DB: meterDb(env.DB, budget),
    FILES: env.FILES ? meterBucket(env.FILES, budget) : undefined,
  }
}

/** Runs one step. If the run's operation budget is spent, the step ends and returns its fallback. */
async function within<T>(fallback: T, step: () => Promise<T>): Promise<T> {
  try {
    return await step()
  } catch (error) {
    if (error instanceof OperationBudgetExhausted) return fallback
    throw error
  }
}

async function deleteExpiredSessions(env: Bindings, now: number, limit = 500): Promise<D1Result> {
  return env.DB.prepare(
    `DELETE FROM sessions WHERE id IN (
       SELECT id FROM sessions WHERE expires_at <= ?1 OR created_at + ?2 <= ?1 LIMIT ?3)`,
  )
    .bind(now, SESSION_ABSOLUTE_MS, limit)
    .run()
}

async function finishPendingDeletions(
  env: Bindings,
  deps: Deps,
): Promise<{ finished: number; failed: number }> {
  const pending = await within<{ user_id: string }[]>([], async () => {
    const result = await env.DB.prepare(
      'SELECT user_id FROM pending_account_deletions ORDER BY requested_at LIMIT ?',
    )
      .bind(PENDING_DELETIONS_PER_RUN)
      .all<{ user_id: string }>()
    return result.results
  })
  let finished = 0
  let failed = 0
  for (const row of pending) {
    try {
      if (await finishAccountDeletion(env, deps, row.user_id)) finished += 1
    } catch (error) {
      // The remaining deletions wait for the next run, and the unfinished one resumes from its row.
      if (error instanceof OperationBudgetExhausted) break
      failed += 1
      console.error(
        JSON.stringify({
          event: 'account_deletion_retry_failed',
          errorClass: error instanceof Error ? error.constructor.name : typeof error,
        }),
      )
    }
  }
  return { finished, failed }
}

/**
 * Lists a bounded number of pages of user objects and deletes those that no activity row
 * references, after a grace period. The listing cursor is saved after every page, so a run that
 * stops early resumes at the next unfinished page, and the whole bucket is covered over
 * successive days.
 */
async function sweepOrphanObjects(env: Bindings, deps: Deps): Promise<number> {
  const db = env.DB
  const bucket = env.FILES
  if (!bucket) return 0
  const saved = await db
    .prepare('SELECT orphan_sweep_cursor AS cursor FROM r2_storage_budget WHERE id = 1')
    .first<{ cursor: string | null }>()
  let cursor = saved?.cursor ?? undefined
  let deleted = 0
  try {
    for (let page = 0; page < ORPHAN_PAGES_PER_RUN; page += 1) {
      await reserveR2Operation(db, deps.now(), { cleanup: true })
      // The bucket may contain objects owned by other features or operators. Restrict the sweep to
      // this service's namespace so an unrelated key is never deleted.
      const listing = await bucket.list({
        prefix: USER_FILES_PREFIX,
        limit: ORPHAN_PAGE_SIZE,
        cursor,
      })
      const cutoff = deps.now() - ORPHAN_GRACE_MS
      const candidates: Candidate[] = listing.objects
        .filter((object) => object.uploaded.getTime() <= cutoff)
        .map((object) => {
          const match = OBJECT_KEY.exec(object.key)
          return { key: object.key, userId: match?.[1], activityId: match?.[2] }
        })
      const orphans = await unreferencedKeys(db, candidates, deps.now())
      if (orphans.length > 0) {
        await bucket.delete(orphans)
        deleted += orphans.length
      }
      cursor = listing.truncated ? listing.cursor : undefined
      await saveSweepCursor(db, cursor)
      if (!listing.truncated) break
    }
  } catch (error) {
    if (!(error instanceof OperationBudgetExhausted)) throw error
  }
  return deleted
}

async function saveSweepCursor(db: D1Database, cursor: string | undefined): Promise<void> {
  await db
    .prepare('UPDATE r2_storage_budget SET orphan_sweep_cursor = ? WHERE id = 1')
    .bind(cursor ?? null)
    .run()
}

/**
 * The candidate keys that no activity row references. A row references an object only when its
 * file_key is exactly that key. An owner with an unexpired upload lease keeps its candidates for
 * this run, because a lease does not record which key it is writing. One D1 query per page for
 * the rows, and one more when a lease needs checking.
 */
async function unreferencedKeys(
  db: D1Database,
  candidates: Candidate[],
  now: number,
): Promise<string[]> {
  const ids = [...new Set(candidates.flatMap((c) => (c.activityId ? [c.activityId] : [])))]
  const referenced = new Set<string>()
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(', ')
    const rows = await db
      .prepare(`SELECT file_key FROM activities WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all<{ file_key: string | null }>()
    for (const row of rows.results) {
      if (row.file_key !== null) referenced.add(row.file_key)
    }
  }
  const unreferenced = candidates.filter((c) => !referenced.has(c.key))
  const owners = [...new Set(unreferenced.flatMap((c) => (c.userId ? [c.userId] : [])))]
  const uploading = new Set<string>()
  if (owners.length > 0) {
    const placeholders = owners.map(() => '?').join(', ')
    const leases = await db
      .prepare(
        `SELECT DISTINCT user_id FROM upload_slots
         WHERE expires_at > ? AND user_id IN (${placeholders})`,
      )
      .bind(now, ...owners)
      .all<{ user_id: string }>()
    for (const row of leases.results) uploading.add(row.user_id)
  }
  return unreferenced
    .filter((c) => c.userId === undefined || !uploading.has(c.userId))
    .map((c) => c.key)
}
