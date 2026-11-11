import type { Bindings } from './env.ts'

/**
 * Accounts compared in one run. Each is one aggregate over its activity rows (at most 4,000), and it
 * reads every digest row whole to sum their lengths, so the page stays small.
 */
export const RECONCILE_USERS_PER_RUN = 5
const DAY_MS = 24 * 60 * 60 * 1000

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
 * One page of accounts per run, ordered by id. The page follows the day number, so the table is
 * covered over successive days without a saved cursor. Accounts being deleted are skipped (their
 * rows go in chunks) and left out of the page count, so no page is empty.
 */
export async function reconcileCounters(env: Bindings, now: number): Promise<ReconcileReport> {
  const total = await env.DB.prepare(
    'SELECT count(*) AS n FROM users WHERE deleting_at IS NULL',
  ).first<{ n: number }>()
  const users = total?.n ?? 0
  if (users === 0) return { checked: 0, drifted: 0 }
  const pages = Math.ceil(users / RECONCILE_USERS_PER_RUN)
  const offset = (Math.floor(now / DAY_MS) % pages) * RECONCILE_USERS_PER_RUN
  const page = await env.DB.prepare(
    `WITH page AS (
       SELECT id, activity_count, digest_bytes, file_bytes, library_version FROM users
       WHERE deleting_at IS NULL ORDER BY id LIMIT ?1 OFFSET ?2)
     SELECT p.id, p.activity_count, p.digest_bytes, p.file_bytes, p.library_version,
       coalesce(j.computed_version, 0) AS computed_version,
       coalesce(a.rows, 0) AS rows, coalesce(a.digest, 0) AS digest, coalesce(a.files, 0) AS files
     FROM page p
     LEFT JOIN state_jobs j ON j.user_id = p.id
     LEFT JOIN (
       SELECT user_id, count(*) AS rows, sum(length(CAST(digest_json AS BLOB))) AS digest,
         sum(file_size) AS files
       FROM activities WHERE user_id IN (SELECT id FROM page) GROUP BY user_id) a
       ON a.user_id = p.id`,
  )
    .bind(RECONCILE_USERS_PER_RUN, offset)
    .all<Row>()
  let drifted = 0
  for (const row of page.results) {
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
  return { checked: page.results.length, drifted }
}
