import { ANALYSIS_REVISION } from '@rca/core/stateSnapshot'

/** Records that a compute began, before it reads anything, so a compute that then fails still counts for coalescing. */
export async function markAttempt(db: D1Database, userId: string, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO state_jobs (user_id, attempted_at) VALUES (?1, ?2)
       ON CONFLICT(user_id) DO UPDATE SET attempted_at = ?2`,
    )
    .bind(userId, now)
    .run()
}

/**
 * The cross-isolate claim of a compute made in a request: one conditional upsert of the same `attempted_at` the queue's
 * coalescing reads, so a stale read in another isolate or tab, and a queued message, see it. True when this caller
 * holds the claim (no compute began within `windowMs`); false when another does.
 */
export async function claimCompute(
  db: D1Database,
  userId: string,
  now: number,
  windowMs: number,
): Promise<boolean> {
  const won = await db
    .prepare(
      `INSERT INTO state_jobs (user_id, attempted_at) VALUES (?1, ?2)
       ON CONFLICT(user_id) DO UPDATE SET attempted_at = ?2 WHERE state_jobs.attempted_at <= ?3
       RETURNING user_id`,
    )
    .bind(userId, now, now - windowMs)
    .first<{ user_id: string }>()
  return won !== null
}

/** What a compute covered, and the instant it was computed for. */
export interface Covered {
  version: number
  liftRevision: number
  nowMs: number
  /** When the compute began, for `computed_at`. */
  at: number
}

/**
 * Records a compute and moves the stored snapshot to it when it is later. Two statements in one batch, so one
 * transaction. The coverage (`computed_*`) moves up only, and restarts when the analysis revision changes. The snapshot
 * columns move to a later (revision, version, lift revision, instant), so two jobs that overlap cannot put an older
 * snapshot over a newer one, and a same-version compute on a later day is taken (the content hash leaves out the
 * instant, so an unchanged snapshot still moves its day). `hash` is the new snapshot's; null on the unchanged path,
 * where `matched` names the hash the job found equal, so a hash another job stored meanwhile is never stamped with
 * today. A row holding a later revision than this build's is left alone. UPDATE only: `markAttempt` made the row.
 * Returns the hash the row holds afterwards.
 */
export async function record(
  db: D1Database,
  userId: string,
  covered: Covered,
  hash: string | null,
  matched: string | null,
): Promise<string | null> {
  const { version, liftRevision, nowMs, at } = covered
  const [, , read] = await db.batch([
    db
      .prepare(
        `UPDATE state_jobs SET
           computed_version = CASE WHEN analysis_revision = ?4 THEN max(computed_version, ?2) ELSE ?2 END,
           computed_lift_revision = CASE WHEN analysis_revision = ?4 THEN max(computed_lift_revision, ?3) ELSE ?3 END,
           computed_at = ?5
         WHERE user_id = ?1 AND analysis_revision <= ?4`,
      )
      .bind(userId, version, liftRevision, ANALYSIS_REVISION, at),
    db
      .prepare(
        `UPDATE state_jobs SET snapshot_hash = coalesce(?5, snapshot_hash), snapshot_version = ?2,
           snapshot_lift_revision = ?3, snapshot_now_ms = ?6, analysis_revision = ?4
         WHERE user_id = ?1 AND (?7 IS NULL OR snapshot_hash = ?7) AND (analysis_revision < ?4 OR (
           analysis_revision = ?4 AND (snapshot_version, snapshot_lift_revision, snapshot_now_ms) < (?2, ?3, ?6)))`,
      )
      .bind(userId, version, liftRevision, ANALYSIS_REVISION, hash, nowMs, matched),
    db.prepare('SELECT snapshot_hash FROM state_jobs WHERE user_id = ?').bind(userId),
  ])
  return (read!.results as { snapshot_hash: string | null }[])[0]?.snapshot_hash ?? null
}
