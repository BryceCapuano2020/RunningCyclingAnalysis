import type { Bindings } from './env.ts'
import { HttpError } from './errors.ts'
import type { Deps } from './deps.ts'
import { recordDatabaseSize, sweepUserFiles } from './storage.ts'
import { GOOGLE_PROVIDER } from './auth/accounts.ts'
import { identityKeyFor } from './auth/signupGate.ts'
import { saveCountsStatement } from './identityBudget.ts'

/**
 * How long a deleted account's tombstone is kept: longer than the 90-day backup archives, so a
 * restore from any copy the project holds can still be reconciled. D1 Time Travel reaches back
 * 30 days at most.
 */
export const TOMBSTONE_RETENTION_DAYS = 100
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Starts an account deletion. The account stops accepting writes and sign-ins at once, and a
 * pending row records the work so that an interrupted deletion can be finished later.
 */
export async function startAccountDeletion(
  env: Bindings,
  userId: string,
  now: number,
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET deleting_at = coalesce(deleting_at, ?) WHERE id = ?').bind(
      now,
      userId,
    ),
    env.DB.prepare(
      `INSERT INTO pending_account_deletions (user_id, requested_at, sweep_pending)
       VALUES (?, ?, ?) ON CONFLICT(user_id) DO NOTHING`,
    ).bind(userId, now, env.FILES ? 1 : 0),
  ])
}

/**
 * Finishes an account deletion: sweep R2, delete the user row (which cascades to every table
 * that references it), sweep again for uploads that raced the first sweep, then clear the pending
 * row. Safe to call again after any interruption.
 *
 * Failures before the user row is deleted are thrown, so the caller can retry. Once the row is
 * gone the account is deleted: a failure in the final sweep is logged and left pending for the
 * scheduler, because the next request cannot authenticate to retry it.
 *
 * Returns false when no deletion is pending for the user.
 */
export async function finishAccountDeletion(
  env: Bindings,
  deps: Deps,
  userId: string,
): Promise<boolean> {
  const db = env.DB
  // Decide once, while the user row still exists and deleting_at blocks new reservations: with no
  // file rows, no R2 object can appear later, so no sweep is needed.
  await db
    .prepare(
      `UPDATE pending_account_deletions SET sweep_pending = 0
       WHERE user_id = ? AND sweep_pending = 1
         AND EXISTS (SELECT 1 FROM users WHERE id = ? AND deleting_at IS NOT NULL)
         AND NOT EXISTS (
           SELECT 1 FROM activities
           WHERE user_id = ? AND (file_key IS NOT NULL OR file_size IS NOT NULL))`,
    )
    .bind(userId, userId, userId)
    .run()
  const pending = await db
    .prepare('SELECT sweep_pending FROM pending_account_deletions WHERE user_id = ?')
    .bind(userId)
    .first<{ sweep_pending: number }>()
  if (!pending) return false
  const sweep = pending.sweep_pending === 1

  if (sweep) await sweepBeforeDelete(env, deps, userId)
  await deleteUserKeepingCounts(env, deps, userId)

  try {
    if (sweep) await sweepBeforeDelete(env, deps, userId)
    const cleared = await db
      .prepare('DELETE FROM pending_account_deletions WHERE user_id = ?')
      .bind(userId)
      .run()
    // The account's rows are gone, so the size after this statement is the size without them.
    await recordDatabaseSize(db, deps.now(), cleared.meta.size_after)
  } catch (error) {
    console.error(
      JSON.stringify({ event: 'account_deletion_left_pending', errorClass: errorClass(error) }),
    )
  }
  return true
}

/**
 * Deletes the user row, which cascades to every table that references it. In the same batch, the
 * account's tombstone is written (a restore from an older copy must not bring the account back),
 * and the counts the user spent today are saved under a keyed code of its Google identity, so
 * signing up again the same UTC day does not start from zero (see identityBudget.ts). A user
 * without a Google identity, or a deployment without a usable signing key, is deleted without the
 * save.
 */
async function deleteUserKeepingCounts(env: Bindings, deps: Deps, userId: string): Promise<void> {
  const db = env.DB
  const link = await db
    .prepare('SELECT provider_user_id FROM oauth_accounts WHERE user_id = ? AND provider = ?')
    .bind(userId, GOOGLE_PROVIDER)
    .first<{ provider_user_id: string }>()
  const identityKey = link
    ? await identityKeyFor(env.SESSION_SIGNING_KEY, link.provider_user_id)
    : undefined
  const now = deps.now()
  const statements = [
    db
      .prepare('INSERT OR IGNORE INTO account_tombstones (user_id, deleted_at) VALUES (?, ?)')
      .bind(userId, now),
    db.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ]
  if (identityKey !== undefined)
    statements.unshift(saveCountsStatement(db, identityKey, userId, now))
  await db.batch(statements)
}

/** Removes tombstones older than the retention period. Bounded per call. */
export async function pruneAccountTombstones(
  db: D1Database,
  now: number,
  limit = 1000,
): Promise<number> {
  const result = await db
    .prepare(
      'DELETE FROM account_tombstones WHERE rowid IN (SELECT rowid FROM account_tombstones WHERE deleted_at < ? LIMIT ?)',
    )
    .bind(now - TOMBSTONE_RETENTION_DAYS * DAY_MS, limit)
    .run()
  return result.meta.changes
}

async function sweepBeforeDelete(env: Bindings, deps: Deps, userId: string): Promise<void> {
  if (!env.FILES) {
    throw new HttpError(
      503,
      'file_storage_unavailable',
      'Original files must be available before this account can be deleted',
    )
  }
  await sweepUserFiles(env.DB, env.FILES, userId, deps.now)
}

function errorClass(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error
}
