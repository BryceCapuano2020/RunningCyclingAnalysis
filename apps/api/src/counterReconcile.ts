import type { Bindings } from './env.ts'
import { OperationBudgetExhausted } from './maintenanceGuard.ts'

/**
 * Accounts compared in one run. Each is one aggregate over its activity rows (at most 3,000), and it
 * reads every digest row whole to sum their lengths, so the page stays small.
 */
export const RECONCILE_USERS_PER_RUN = 5

export interface ReconcileReport {
  checked: number
  drifted: number
}

interface Row {
  id: string
  activity_count: number
  digest_bytes: number
  file_bytes: number
  library_version: number
  computed_version: number
  rows: number
  digest: number
  files: number
  /** 1 when an account follows this page. */
  more: number
}

/**
 * Daily and report-only: compares the counters the quota checks read (`activity_count`,
 * `digest_bytes`, `file_bytes`, kept by route code and by triggers in the migrations) with the sums
 * of the account's rows, and `library_version` with the state job's `computed_version`, which it can
 * never be below. Changes nothing. It logs one line for each account that differs, naming the
 * counters and never their values, and the caller logs the totals.
 *
 * A create or a label write in flight while the check reads can show a brief mismatch: `digest_bytes`
 * is reserved before the row is written. One report alone is noise; the same account reported on
 * its next turn is drift.
 *
 * One page of accounts per run, ordered by id, resumed from the last id read (`r2_storage_budget.reconcile_cursor`), so
 * accounts added or deleted between runs move nothing: every account that is there from the start is read within
 * ceil(n / page) runs. The cursor wraps to the start when no account follows the page, and a page that comes back empty
 * (everything after the cursor was deleted) is read again from the start in the same run. Accounts being deleted are
 * skipped (their rows go in chunks). When the run's operation budget is spent the step logs `counter_reconcile_skipped`
 * and the next run takes the same page.
 */
export async function reconcileCounters(env: Bindings, now: number): Promise<ReconcileReport> {
  try {
    return await reconcilePage(env, now)
  } catch (error) {
    if (!(error instanceof OperationBudgetExhausted)) throw error
    console.warn(JSON.stringify({ event: 'counter_reconcile_skipped' }))
    return { checked: 0, drifted: 0 }
  }
}

/** One page of accounts after the saved cursor, or from the first account when `fromStart`. */
async function readPage(env: Bindings, fromStart: boolean): Promise<Row[]> {
  const page = await env.DB.prepare(
    `WITH page AS (
       SELECT id, activity_count, digest_bytes, file_bytes, library_version FROM users
       WHERE deleting_at IS NULL
         AND id > CASE WHEN ?2 = 1 THEN ''
                       ELSE coalesce((SELECT reconcile_cursor FROM r2_storage_budget WHERE id = 1), '') END
       ORDER BY id LIMIT ?1)
     SELECT p.id, p.activity_count, p.digest_bytes, p.file_bytes, p.library_version,
       coalesce(j.computed_version, 0) AS computed_version,
       coalesce(a.rows, 0) AS rows, coalesce(a.digest, 0) AS digest, coalesce(a.files, 0) AS files,
       EXISTS (SELECT 1 FROM users u WHERE u.deleting_at IS NULL AND u.id > (SELECT max(id) FROM page)) AS more
     FROM page p
     LEFT JOIN state_jobs j ON j.user_id = p.id
     LEFT JOIN (
       SELECT user_id, count(*) AS rows, sum(length(CAST(digest_json AS BLOB))) AS digest,
         sum(file_size) AS files
       FROM activities WHERE user_id IN (SELECT id FROM page) GROUP BY user_id) a
       ON a.user_id = p.id
     ORDER BY p.id`,
  )
    .bind(RECONCILE_USERS_PER_RUN, fromStart ? 1 : 0)
    .all<Row>()
  return page.results
}

async function reconcilePage(env: Bindings, now: number): Promise<ReconcileReport> {
  let rows = await readPage(env, false)
  // Every account after the cursor has gone (or none ever followed it): start again from the first in this run rather than
  // check nothing until the next one.
  if (rows.length === 0) rows = await readPage(env, true)
  const last = rows.at(-1)
  // Another page follows: resume after this one. None does: the next run starts from the first account.
  const next = last !== undefined && last.more === 1 ? last.id : null
  // The budget row is made by the first R2 reservation; a database with none yet gets it here, as the health probe does.
  await env.DB.prepare(
    `INSERT INTO r2_storage_budget (id, lifetime_put_bytes, monthly_period, monthly_operations, monthly_put_bytes, reconcile_cursor)
     VALUES (1, 0, ?1, 0, 0, ?2) ON CONFLICT(id) DO UPDATE SET reconcile_cursor = ?2`,
  )
    .bind(new Date(now).toISOString().slice(0, 7), next)
    .run()
  let drifted = 0
  for (const row of rows) {
    const counters = [
      row.activity_count !== row.rows ? 'activity_count' : null,
      row.digest_bytes !== row.digest ? 'digest_bytes' : null,
      row.file_bytes !== row.files ? 'file_bytes' : null,
      row.library_version < row.computed_version ? 'library_version' : null,
    ].filter((name) => name !== null)
    if (counters.length === 0) continue
    drifted += 1
    console.warn(JSON.stringify({ event: 'counter_drift', userId: row.id, counters }))
  }
  return { checked: rows.length, drifted }
}
