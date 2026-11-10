/**
 * Whether a message for an account is on its way to the state job, kept in `state_jobs.pending_until` (migration 0015).
 * A write sends a message only when none is, so an import of thousands of files sends a handful of messages, not one per
 * file. The job clears the marker before it reads the account, so a write that lands after that sends its own message,
 * and one that the marker held back is already in what the job reads. A marker outlives its message's delay by this
 * grace, then lapses on its own: a message the Queue lost, or one that went to the dead-letter queue, holds back writes
 * for no longer than that.
 */
export const STATE_PENDING_GRACE_SECONDS = 120

const until = (now: number, delaySeconds: number) =>
  now + (delaySeconds + STATE_PENDING_GRACE_SECONDS) * 1000

/**
 * Marks a message as on its way unless one already is. True when the caller should send it; false when another
 * message (a write's, a retry's, a deferred job's) will run the job anyway.
 */
export async function claimPending(
  db: D1Database,
  userId: string,
  now: number,
  delaySeconds: number,
): Promise<boolean> {
  const row = await db
    .prepare(
      `INSERT INTO state_jobs (user_id, pending_until) VALUES (?1, ?2)
       ON CONFLICT(user_id) DO UPDATE SET pending_until = ?2 WHERE state_jobs.pending_until <= ?3
       RETURNING user_id`,
    )
    .bind(userId, until(now, delaySeconds), now)
    .first<{ user_id: string }>()
  return row !== null
}

/** Marks a message as on its way whatever the marker held: the caller has one on its way already (a retry). */
export async function markPending(
  db: D1Database,
  userId: string,
  now: number,
  delaySeconds: number,
): Promise<void> {
  await db
    .prepare('UPDATE state_jobs SET pending_until = ? WHERE user_id = ?')
    .bind(until(now, delaySeconds), userId)
    .run()
}

/** The message has arrived: from here a write sends its own. */
export async function clearPending(db: D1Database, userId: string): Promise<void> {
  await db.prepare('UPDATE state_jobs SET pending_until = 0 WHERE user_id = ?').bind(userId).run()
}
