import { DAILY_LIMITS, MAX_CONCURRENT_UPLOADS_PER_USER, type DailyLimitAction } from '@rca/contract'
import { HttpError } from './errors.ts'

const DAY_MS = 24 * 60 * 60 * 1000
/** A slot outlives any real upload, so a crashed request frees it without operator action. */
export const UPLOAD_SLOT_LEASE_MS = 5 * 60 * 1000
/** Daily rows older than this are pruned; the budget only ever reads the current day. */
export const DAILY_ROW_RETENTION_DAYS = 7

/** UTC calendar day as YYYY-MM-DD. */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

/** The next 00:00 UTC after `now`, in epoch milliseconds. */
export function nextUtcMidnight(now: number): number {
  const day = new Date(now)
  return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1)
}

export interface DailyCharge {
  /** Gives the unit back when the request ends before doing the work it paid for. */
  refund(): Promise<void>
}

function dailyLimitError(now: number): HttpError {
  const seconds = Math.max(1, Math.ceil((nextUtcMidnight(now) - now) / 1000))
  return new HttpError(
    429,
    'daily_limit',
    'You have reached your daily limit. Try again after midnight UTC',
    {
      retryAfter: seconds,
    },
  )
}

/**
 * Takes one unit of a user's daily budget. The upsert succeeds only while the day's count is
 * below the limit, so concurrent requests cannot admit more than the limit between them.
 * Throws 429 daily_limit with a Retry-After to the next UTC midnight when the budget is spent.
 */
export async function chargeDaily(
  db: D1Database,
  userId: string,
  action: DailyLimitAction,
  now: number,
): Promise<DailyCharge> {
  const day = utcDay(now)
  const admitted = await db
    .prepare(
      `INSERT INTO daily_budget (user_id, day, action, used) VALUES (?, ?, ?, 1)
       ON CONFLICT(user_id, day, action) DO UPDATE SET used = used + 1
       WHERE used < ?
       RETURNING used`,
    )
    .bind(userId, day, action, DAILY_LIMITS[action])
    .first<{ used: number }>()
  if (!admitted) throw dailyLimitError(now)
  return {
    refund: async () => {
      await db
        .prepare(
          'UPDATE daily_budget SET used = used - 1 WHERE user_id = ? AND day = ? AND action = ? AND used > 0',
        )
        .bind(userId, day, action)
        .run()
    },
  }
}

/** Removes daily rows from before the retention window. Bounded per call. */
export async function pruneDailyBudget(db: D1Database, now: number, limit = 1000): Promise<number> {
  const cutoff = utcDay(now - DAILY_ROW_RETENTION_DAYS * DAY_MS)
  const result = await db
    .prepare(
      'DELETE FROM daily_budget WHERE rowid IN (SELECT rowid FROM daily_budget WHERE day < ? LIMIT ?)',
    )
    .bind(cutoff, limit)
    .run()
  return result.meta.changes
}

/**
 * Takes one of the user's original-upload slots, or throws 429 upload_in_progress. The count and
 * the insert are one statement, so two requests cannot both take the last slot.
 */
export async function acquireUploadSlot(
  db: D1Database,
  userId: string,
  slotId: string,
  now: number,
): Promise<void> {
  const taken = await db
    .prepare(
      `INSERT INTO upload_slots (user_id, slot_id, expires_at)
       SELECT ?, ?, ?
       WHERE (SELECT COUNT(*) FROM upload_slots WHERE user_id = ? AND expires_at > ?) < ?
       RETURNING slot_id`,
    )
    .bind(userId, slotId, now + UPLOAD_SLOT_LEASE_MS, userId, now, MAX_CONCURRENT_UPLOADS_PER_USER)
    .first<{ slot_id: string }>()
  if (!taken) {
    throw new HttpError(
      429,
      'upload_in_progress',
      'Finish your other uploads before starting another',
      {
        retryAfter: 5,
      },
    )
  }
}

export async function releaseUploadSlot(
  db: D1Database,
  userId: string,
  slotId: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM upload_slots WHERE user_id = ? AND slot_id = ?')
    .bind(userId, slotId)
    .run()
}

/** Removes leases that have expired. Bounded per call. */
export async function pruneUploadSlots(db: D1Database, now: number, limit = 500): Promise<number> {
  const result = await db
    .prepare(
      'DELETE FROM upload_slots WHERE rowid IN (SELECT rowid FROM upload_slots WHERE expires_at <= ? LIMIT ?)',
    )
    .bind(now, limit)
    .run()
  return result.meta.changes
}
