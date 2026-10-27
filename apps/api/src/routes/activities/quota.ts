import {
  DATABASE_SOFT_LIMIT_BYTES,
  MAX_ACTIVITIES_PER_USER,
  MAX_DIGEST_BYTES_PER_USER,
} from '@rca/contract'
import { HttpError } from '../../errors.ts'

export const databaseFull = () =>
  new HttpError(503, 'database_full', 'Activities cannot be saved while the database is full')

export const digestQuota = () =>
  new HttpError(
    403,
    'digest_quota',
    `You can store at most ${MAX_DIGEST_BYTES_PER_USER / (1024 * 1024)} MiB of activity digests`,
  )

export const activityQuota = () =>
  new HttpError(
    403,
    'activity_quota',
    `You can store at most ${MAX_ACTIVITIES_PER_USER} activities`,
  )

/** The counters that decide whether an account may store another activity. */
export interface AccountState {
  deletingAt: number | null
  activityCount: number
  digestBytes: number
  databaseBytes: number
}

/** The account counters and the last-seen database size, in one read. */
export async function accountState(db: D1Database, userId: string): Promise<AccountState> {
  const row = await db
    .prepare(
      `SELECT deleting_at AS deletingAt, activity_count AS activityCount,
         digest_bytes AS digestBytes,
         coalesce((SELECT d1_size_bytes FROM r2_storage_budget WHERE id = 1), 0) AS databaseBytes
       FROM users WHERE id = ?`,
    )
    .bind(userId)
    .first<AccountState>()
  return row ?? { deletingAt: null, activityCount: 0, digestBytes: 0, databaseBytes: 0 }
}

/**
 * Why a new activity with a digest of this size does not fit the account, or undefined when it
 * does. The conditions are the ones the insert itself holds, in the order the answer reports them.
 */
export function createRefusal(state: AccountState, digestBytes: number): HttpError | undefined {
  if (state.databaseBytes > DATABASE_SOFT_LIMIT_BYTES) return databaseFull()
  if (state.digestBytes + digestBytes > MAX_DIGEST_BYTES_PER_USER) return digestQuota()
  if (state.activityCount >= MAX_ACTIVITIES_PER_USER) return activityQuota()
  return undefined
}
