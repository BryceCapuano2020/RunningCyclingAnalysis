import { RESULT_REVISION } from './resultRevision.ts'

/**
 * The cross-isolate claim of a compute: one conditional upsert, so a stale read in another isolate or tab, and a queued
 * message, see it. It stamps `attempted_at` (the queue's coalescing reads it) and `claim_until`, which only the claim
 * reads: a caller wins when no claim is held (`claim_until` passed). `windowMs` bounds a compute that dies without
 * releasing; `releaseClaim` frees it the moment a compute finishes. Returns the stamp (`claim_until`) the caller holds,
 * or null when another does.
 */
export async function claimCompute(
  db: D1Database,
  userId: string,
  now: number,
  windowMs: number,
): Promise<number | null> {
  const until = now + windowMs
  const won = await db
    .prepare(
      `INSERT INTO state_jobs (user_id, attempted_at, claim_until) VALUES (?1, ?2, ?3)
       ON CONFLICT(user_id) DO UPDATE SET attempted_at = ?2, claim_until = ?3 WHERE state_jobs.claim_until <= ?2
       RETURNING user_id`,
    )
    .bind(userId, now, until)
    .first<{ user_id: string }>()
  return won === null ? null : until
}

/** Stamps a held claim again (a read that runs a second time inside one request); returns the new stamp. */
export async function restampClaim(
  db: D1Database,
  userId: string,
  now: number,
  windowMs: number,
): Promise<number> {
  const until = now + windowMs
  await db
    .prepare('UPDATE state_jobs SET attempted_at = ?, claim_until = ? WHERE user_id = ?')
    .bind(now, until, userId)
    .run()
  return until
}

/**
 * Frees the claim a compute took once it has finished (written, unchanged, gone or failed), so the next stale read
 * computes at once. Only the claim this stamp names: one a later compute took after the window ran out stays. The queue's
 * interval is untouched (`attempted_at` and `computed_at` still say when the compute began).
 */
export async function releaseClaim(db: D1Database, userId: string, stamp: number): Promise<void> {
  await db
    .prepare('UPDATE state_jobs SET claim_until = 0 WHERE user_id = ? AND claim_until = ?')
    .bind(userId, stamp)
    .run()
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
 * transaction. The coverage (`computed_*`) moves up only, restarts when the result revision changes, and on the unchanged path moves only while the row still holds the matched hash, so it never says a version is covered while another job's snapshot is stored. The snapshot
 * columns move to a later (revision, version, lift revision, instant), so two jobs that overlap cannot put an older
 * snapshot over a newer one, and a same-version compute on a later day is taken (the content hash leaves out the
 * instant, so an unchanged snapshot still moves its day). `hash` is the new snapshot's; null on the unchanged path,
 * where `matched` names the hash the job found equal, so a hash another job stored meanwhile is never stamped with
 * today. A row holding a later revision than this build's is left alone. UPDATE only: `claimCompute` made the row.
 * Returns the hash the row holds afterwards (`held`) and the one it held before (`prior`, the object to delete).
 */
export async function record(
  db: D1Database,
  userId: string,
  covered: Covered,
  hash: string | null,
  matched: string | null,
): Promise<{ held: string | null; prior: string | null }> {
  const { version, liftRevision, nowMs, at } = covered
  const [prior, , , read] = await db.batch([
    db.prepare('SELECT snapshot_hash FROM state_jobs WHERE user_id = ?').bind(userId),
    db
      .prepare(
        `UPDATE state_jobs SET
           computed_version = CASE WHEN analysis_revision = ?3 THEN max(computed_version, ?2) ELSE ?2 END,
           computed_at = ?4
         WHERE user_id = ?1 AND analysis_revision <= ?3 AND (?5 IS NULL OR snapshot_hash = ?5)`,
      )
      .bind(userId, version, RESULT_REVISION, at, matched),
    db
      .prepare(
        `UPDATE state_jobs SET snapshot_hash = coalesce(?5, snapshot_hash), snapshot_version = ?2,
           snapshot_lift_revision = ?3, snapshot_now_ms = ?6, analysis_revision = ?4
         WHERE user_id = ?1 AND (?7 IS NULL OR snapshot_hash = ?7) AND (analysis_revision < ?4 OR (
           analysis_revision = ?4 AND (snapshot_version, snapshot_lift_revision, snapshot_now_ms) < (?2, ?3, ?6)))`,
      )
      .bind(userId, version, liftRevision, RESULT_REVISION, hash, nowMs, matched),
    db.prepare('SELECT snapshot_hash FROM state_jobs WHERE user_id = ?').bind(userId),
  ])
  const hashOf = (r: D1Result) =>
    (r.results as { snapshot_hash: string | null }[])[0]?.snapshot_hash ?? null
  return { held: hashOf(read!), prior: hashOf(prior!) }
}
