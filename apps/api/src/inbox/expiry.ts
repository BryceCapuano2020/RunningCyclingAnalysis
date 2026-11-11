import type { Bindings } from '../env.ts'
import { reserveR2Operation } from '../storage.ts'

/** Days a `done` row, or a `pending` one that never finished, is kept: long enough to answer a repeated push. */
export const SETTLED_INBOX_RETENTION_DAYS = 7
/** Days a file that could not be read is kept, so the athlete can be shown it and a later parser can try it. */
export const FAILED_INBOX_RETENTION_DAYS = 30
/** Rows one maintenance run deletes: one D1 statement, then one R2 delete for their files (at most 1,000 keys). */
export const INBOX_EXPIRY_PER_RUN = 90

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Deletes the oldest expired inbox rows (docs/design/garmin-sync.md decision 11), then their files. The rows are
 * deleted first and say which files were theirs, so a row that changed state since cannot lose a file it still needs;
 * a run stopped between the two leaves files no row names, which the orphan scan removes. The rows left are the
 * cursor: each run starts at the oldest that is still expired, so a backlog clears over successive nights.
 */
export async function expireInboxItems(env: Bindings, now: number): Promise<number> {
  const settledBefore = now - SETTLED_INBOX_RETENTION_DAYS * DAY_MS
  const failedBefore = now - FAILED_INBOX_RETENTION_DAYS * DAY_MS
  const expired = `(state IN ('done', 'pending') AND received_at < ?1) OR (state = 'failed' AND received_at < ?2)`
  const deleted = await env.DB.prepare(
    `DELETE FROM inbox_items
     WHERE id IN (SELECT id FROM inbox_items WHERE ${expired} ORDER BY received_at LIMIT ?3)
       AND (${expired})
     RETURNING file_key`,
  )
    .bind(settledBefore, failedBefore, INBOX_EXPIRY_PER_RUN)
    .all<{ file_key: string | null }>()
  const keys = deleted.results.flatMap((row) => (row.file_key === null ? [] : [row.file_key]))
  if (keys.length > 0 && env.FILES) {
    await reserveR2Operation(env.DB, now, { cleanup: true })
    await env.FILES.delete(keys)
  }
  return deleted.results.length
}
