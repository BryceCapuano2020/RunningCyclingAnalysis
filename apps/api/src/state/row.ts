import { RESULT_REVISION } from './resultRevision.ts'
import { DEFAULT_ZONE } from './compute.ts'
import { zoneNamed } from './zone.ts'

const DAY_MS = 86_400_000

/** What one account's row holds of its job and its inputs, read in one statement. */
export interface JobRow {
  library_version: number
  lift_revision: number
  activity_count: number
  computed_version: number | null
  snapshot_version: number | null
  snapshot_lift_revision: number | null
  computed_at: number | null
  attempted_at: number | null
  snapshot_hash: string | null
  snapshot_now_ms: number | null
  analysis_revision: number | null
  zone: string | null
}

export async function jobRow(db: D1Database, userId: string): Promise<JobRow | null> {
  return db
    .prepare(
      `SELECT u.library_version, u.lift_revision, u.activity_count, j.computed_version, j.snapshot_version, j.snapshot_lift_revision,
              j.computed_at, j.attempted_at, j.snapshot_hash, j.snapshot_now_ms, j.analysis_revision,
              (SELECT s.zone FROM athlete_settings s WHERE s.user_id = u.id) AS zone
       FROM users u LEFT JOIN state_jobs j ON j.user_id = u.id
       WHERE u.id = ? AND u.deleting_at IS NULL`,
    )
    .bind(userId)
    .first<JobRow>()
}

/** The local day number of an instant in the account's zone (`UTC` while the browser has reported none). */
export function localDayOf(zone: string | null, ms: number): number {
  return Math.floor((ms + zoneNamed(zone ?? DEFAULT_ZONE)(ms) * 60_000) / DAY_MS)
}

/**
 * How the stored snapshot stands against this build's result revision (resultRevision.ts): `newer` when a later Worker made it
 * (a rollback, a rolling deploy), which this one never overwrites; `older` when an earlier analysis, snapshot version or lift
 * estimator made it (or none is stored); `same` otherwise.
 */
export type RevisionOrder = 'newer' | 'same' | 'older'

export function revisionOrder(row: JobRow): RevisionOrder {
  if (row.snapshot_hash === null) return 'older'
  const stored = row.analysis_revision ?? 0
  return stored > RESULT_REVISION ? 'newer' : stored === RESULT_REVISION ? 'same' : 'older'
}

/**
 * Whether the stored snapshot is the answer now: it covers the library version and the lift revision (`snapshot_*`: what the stored snapshot covers, not what a compute reached), was made under
 * this build's result revision, and was made for today in the account's zone (a day ago it would show last night's week).
 */
export function isCurrent(row: JobRow, now: number): boolean {
  return (
    row.snapshot_hash !== null &&
    (row.snapshot_version ?? 0) >= row.library_version &&
    (row.snapshot_lift_revision ?? 0) >= row.lift_revision &&
    (row.analysis_revision ?? 0) === RESULT_REVISION &&
    localDayOf(row.zone, row.snapshot_now_ms ?? 0) === localDayOf(row.zone, now)
  )
}
