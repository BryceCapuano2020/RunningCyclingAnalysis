import { MAX_ACCOUNT_CREATES_PER_DAY } from '@rca/contract'
import { signupLimit } from './errors.ts'
import { secondsToNextUtcMidnight, utcDay } from './budget.ts'

/** The `action` under which an identity's account creations are counted in `identity_budget`. */
export const ACCOUNT_CREATE_ACTION = 'accountCreate'
const DAY_MS = 24 * 60 * 60 * 1000

export interface AccountCreateCharge {
  /** Gives the unit back when the account was not created after all. */
  refund(): Promise<void>
}

/**
 * Counts one account creation for the identity today, or throws 429 `signup_limit` when it already
 * created MAX_ACCOUNT_CREATES_PER_DAY, deleted accounts included. The upsert is the check, so two
 * simultaneous sign-ups cannot both take the last unit.
 */
export async function takeAccountCreate(
  db: D1Database,
  identityKey: string,
  now: number,
): Promise<AccountCreateCharge> {
  const day = utcDay(now)
  const taken = await db
    .prepare(
      `INSERT INTO identity_budget (identity_key, day, action, used) VALUES (?, ?, ?, 1)
       ON CONFLICT(identity_key, day, action) DO UPDATE SET used = used + 1
       WHERE used < ?
       RETURNING used`,
    )
    .bind(identityKey, day, ACCOUNT_CREATE_ACTION, MAX_ACCOUNT_CREATES_PER_DAY)
    .first<{ used: number }>()
  if (!taken) {
    throw signupLimit(secondsToNextUtcMidnight(now))
  }
  return {
    refund: async () => {
      await db
        .prepare(
          'UPDATE identity_budget SET used = used - 1 WHERE identity_key = ? AND day = ? AND action = ? AND used > 0',
        )
        .bind(identityKey, day, ACCOUNT_CREATE_ACTION)
        .run()
    },
  }
}

/**
 * The statement that gives a new user back the counts its identity had spent today before an
 * earlier account was deleted. Meant for the same batch that inserts the user.
 */
export function restoreCountsStatement(
  db: D1Database,
  identityKey: string,
  userId: string,
  now: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO daily_budget (user_id, day, action, used)
       SELECT ?, day, action, used FROM identity_budget
       WHERE identity_key = ? AND day = ? AND action <> ?`,
    )
    .bind(userId, identityKey, utcDay(now), ACCOUNT_CREATE_ACTION)
}

/**
 * The statement that saves a user's counts for today under its identity. Meant for the same batch
 * that deletes the user. A count already saved is never lowered.
 */
export function saveCountsStatement(
  db: D1Database,
  identityKey: string,
  userId: string,
  now: number,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO identity_budget (identity_key, day, action, used)
       SELECT ?, day, action, used FROM daily_budget WHERE user_id = ? AND day = ?
       ON CONFLICT(identity_key, day, action) DO UPDATE SET used = max(used, excluded.used)`,
    )
    .bind(identityKey, userId, utcDay(now))
}

/** Removes saved counts from before yesterday. Bounded per call. */
export async function pruneIdentityBudget(
  db: D1Database,
  now: number,
  limit = 1000,
): Promise<number> {
  const cutoff = utcDay(now - DAY_MS)
  const result = await db
    .prepare(
      'DELETE FROM identity_budget WHERE rowid IN (SELECT rowid FROM identity_budget WHERE day < ? LIMIT ?)',
    )
    .bind(cutoff, limit)
    .run()
  return result.meta.changes
}
