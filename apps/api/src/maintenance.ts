import type { Bindings } from './env.ts'
import type { Deps } from './deps.ts'
import { finishAccountDeletion } from './accountDeletion.ts'
import { pruneDailyBudget, pruneUploadSlots } from './budget.ts'
import { SESSION_ABSOLUTE_MS } from './auth/session.ts'
import { reserveR2Operation } from './storage.ts'

/** Objects younger than this may still be mid-upload, so the orphan sweep leaves them alone. */
export const ORPHAN_GRACE_MS = 60 * 60 * 1000
/** Keys per listing page. Each page is one D1 query with one bound parameter per key. */
export const ORPHAN_PAGE_SIZE = 90
/** Bounds R2 LIST calls and D1 queries per scheduled run (Workers Free allows 50 D1 queries per run). */
export const ORPHAN_PAGES_PER_RUN = 2
/** Account deletions finished per run. */
export const PENDING_DELETIONS_PER_RUN = 2

export interface MaintenanceReport {
  sessions: number
  slots: number
  budgetRows: number
  finishedDeletions: number
  failedDeletions: number
  orphansDeleted: number
}

const OBJECT_KEY = /^users\/([^/]+)\/([^/]+)$/
const USER_FILES_PREFIX = 'users/'

/**
 * The daily maintenance pass, run by the scheduled handler. Every step is bounded, so one run
 * stays within the Workers Free CPU and query limits, and the next run continues the work.
 */
export async function runMaintenance(env: Bindings, deps: Deps): Promise<MaintenanceReport> {
  const now = deps.now()
  const sessions = await deleteExpiredSessions(env, now)
  const slots = await pruneUploadSlots(env.DB, now)
  const budgetRows = await pruneDailyBudget(env.DB, now)
  const { finished, failed } = await finishPendingDeletions(env, deps)
  const orphansDeleted = env.FILES ? await sweepOrphanObjects(env, deps) : 0
  return {
    sessions,
    slots,
    budgetRows,
    finishedDeletions: finished,
    failedDeletions: failed,
    orphansDeleted,
  }
}

async function deleteExpiredSessions(env: Bindings, now: number, limit = 500): Promise<number> {
  const result = await env.DB.prepare(
    `DELETE FROM sessions WHERE id IN (
       SELECT id FROM sessions WHERE expires_at <= ?1 OR created_at + ?2 <= ?1 LIMIT ?3)`,
  )
    .bind(now, SESSION_ABSOLUTE_MS, limit)
    .run()
  return result.meta.changes
}

async function finishPendingDeletions(
  env: Bindings,
  deps: Deps,
): Promise<{ finished: number; failed: number }> {
  const pending = await env.DB.prepare(
    'SELECT user_id FROM pending_account_deletions ORDER BY requested_at LIMIT ?',
  )
    .bind(PENDING_DELETIONS_PER_RUN)
    .all<{ user_id: string }>()
  let finished = 0
  let failed = 0
  for (const row of pending.results) {
    try {
      if (await finishAccountDeletion(env, deps, row.user_id)) finished += 1
    } catch (error) {
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
 * Lists a bounded number of pages of user objects and deletes those whose activity row is gone,
 * after a grace period. The listing cursor persists between runs, so the whole bucket is covered
 * over successive days.
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
  for (let page = 0; page < ORPHAN_PAGES_PER_RUN; page += 1) {
    await reserveR2Operation(db, deps.now(), { cleanup: true })
    // The bucket may contain objects owned by other features or operators. Restrict the sweep to
    // this service's namespace so an unrelated key without an activity row is never deleted.
    const listing = await bucket.list({
      prefix: USER_FILES_PREFIX,
      limit: ORPHAN_PAGE_SIZE,
      cursor,
    })
    const cutoff = deps.now() - ORPHAN_GRACE_MS
    const candidates = listing.objects
      .filter((object) => object.uploaded.getTime() <= cutoff)
      .map((object) => {
        const match = OBJECT_KEY.exec(object.key)
        return { key: object.key, userId: match?.[1], activityId: match?.[2] }
      })
    const live = await liveActivityKeys(db, candidates)
    const orphans = candidates
      .filter((c) => !(c.userId !== undefined && live.has(`${c.userId}/${c.activityId}`)))
      .map((c) => c.key)
    if (orphans.length > 0) {
      await bucket.delete(orphans)
      deleted += orphans.length
    }
    if (!listing.truncated) {
      cursor = undefined
      break
    }
    cursor = listing.cursor
  }
  await db
    .prepare('UPDATE r2_storage_budget SET orphan_sweep_cursor = ? WHERE id = 1')
    .bind(cursor ?? null)
    .run()
  return deleted
}

/** The "user/activity" pairs among candidates that still have a row. One query per page. */
async function liveActivityKeys(
  db: D1Database,
  candidates: { userId: string | undefined; activityId: string | undefined }[],
): Promise<Set<string>> {
  const ids = [...new Set(candidates.flatMap((c) => (c.activityId ? [c.activityId] : [])))]
  if (ids.length === 0) return new Set()
  const placeholders = ids.map(() => '?').join(', ')
  const rows = await db
    .prepare(`SELECT id, user_id FROM activities WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all<{ id: string; user_id: string }>()
  return new Set(rows.results.map((row) => `${row.user_id}/${row.id}`))
}
