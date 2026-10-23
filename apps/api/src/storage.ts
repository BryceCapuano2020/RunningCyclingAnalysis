import {
  MAX_GLOBAL_R2_MONTHLY_OPERATIONS,
  MAX_GLOBAL_R2_STANDARD_OPERATIONS,
  MAX_MONTHLY_R2_PUT_BYTES,
  MIN_GLOBAL_R2_PUT_CHARGE_BYTES,
} from '@rca/contract'
import { HttpError } from './errors.ts'

const DEFAULT_PAGE_SIZE = 1000
/** At most 5,000 activities per user, so each of two cleanup sweeps needs at most 5 pages. */
export const MAX_CLEANUP_LIST_RESERVATION = 10

export interface R2CleanupBudget {
  /** UTC month that the operation credits were charged to. */
  period: string
  remaining: number
  db: D1Database
  now: () => number
}

export function userFilePrefix(userId: string): string {
  return `users/${userId}/`
}

export function activityFileKey(userId: string, activityId: string): string {
  return `${userFilePrefix(userId)}${activityId}`
}

function periodFor(now: number): string {
  return new Date(now).toISOString().slice(0, 7)
}

function budgetError(message: string): HttpError {
  return new HttpError(429, 'storage_budget_exhausted', message)
}

/** Atomically reserves a global R2 PUT/GET/LIST operation and optional monthly PUT bytes. */
async function reserveR2Budget(
  db: D1Database,
  now: number,
  operations: number,
  putBytes: number,
  cleanup: boolean,
): Promise<string> {
  const period = periodFor(now)
  const operationCap = cleanup
    ? MAX_GLOBAL_R2_MONTHLY_OPERATIONS
    : MAX_GLOBAL_R2_STANDARD_OPERATIONS
  await db
    .prepare(
      `INSERT INTO r2_storage_budget (id, lifetime_put_bytes, monthly_period, monthly_operations, monthly_put_bytes)
       VALUES (1, 0, ?, 0, 0) ON CONFLICT(id) DO NOTHING`,
    )
    .bind(period)
    .run()
  // A new UTC month starts all three counters from zero. The month comparison is string order on
  // YYYY-MM, which is chronological. lifetime_put_bytes is an audit total and is never enforced.
  const reserved = await db
    .prepare(
      `UPDATE r2_storage_budget
       SET lifetime_put_bytes = lifetime_put_bytes + ?1,
           monthly_put_bytes = CASE WHEN monthly_period < ?2 THEN 0 ELSE monthly_put_bytes END + ?1,
           monthly_period = CASE WHEN monthly_period < ?2 THEN ?2 ELSE monthly_period END,
           monthly_operations = CASE WHEN monthly_period < ?2 THEN ?3 ELSE monthly_operations + ?3 END
       WHERE id = 1
         AND monthly_period <= ?2
         AND (monthly_period < ?2 OR monthly_operations + ?3 <= ?4)
         AND (?1 = 0 OR CASE WHEN monthly_period < ?2 THEN 0 ELSE monthly_put_bytes END + ?1 <= ?5)
       RETURNING id`,
    )
    .bind(putBytes, period, operations, operationCap, MAX_MONTHLY_R2_PUT_BYTES)
    .first<{ id: number }>()
  if (reserved) return period

  const current = await db
    .prepare(
      'SELECT monthly_period, monthly_put_bytes, monthly_operations FROM r2_storage_budget WHERE id = 1',
    )
    .first<{ monthly_period: string; monthly_put_bytes: number; monthly_operations: number }>()
  const bytesThisMonth = current?.monthly_period === period ? current.monthly_put_bytes : 0
  if (putBytes > 0 && bytesThisMonth + putBytes > MAX_MONTHLY_R2_PUT_BYTES) {
    throw budgetError(
      'The deployment has used its monthly original-file write budget. Uploads resume at the start of the next UTC month.',
    )
  }
  if (!current || current.monthly_period > period) {
    throw budgetError(
      'The deployment storage budget clock is ahead of this request; try again later.',
    )
  }
  const reset = new Date(`${period}-01T00:00:00.000Z`)
  reset.setUTCMonth(reset.getUTCMonth() + 1)
  throw budgetError(
    cleanup
      ? `The deployment reached its 100,000-operation monthly R2 hard cap. Cleanup and file operations resume after ${reset.toISOString().slice(0, 10)} UTC.`
      : `The deployment reached its 90,000-operation standard R2 limit. Cleanup remains available until the hard cap; ordinary file operations resume after ${reset.toISOString().slice(0, 10)} UTC.`,
  )
}

export async function reserveR2Operation(
  db: D1Database,
  now: number,
  options: { putBytes?: number; cleanup?: boolean } = {},
): Promise<void> {
  await reserveR2Budget(db, now, 1, options.putBytes ?? 0, options.cleanup ?? false)
}

/** Reserves immediately before a R2 call and re-reserves if D1 latency crossed a UTC month. */
async function reserveBeforeR2Call(
  db: D1Database,
  currentTime: () => number,
  options: { putBytes?: number } = {},
): Promise<void> {
  const putBytes = options.putBytes ?? 0
  let reservedPeriod = await reserveR2Budget(db, currentTime(), 1, putBytes, false)
  for (let transition = 0; transition <= 2; transition += 1) {
    const currentPeriod = periodFor(currentTime())
    if (currentPeriod === reservedPeriod) return
    if (transition === 2) break
    // Keep the prior period's operation/byte reservation; the extra reservation is conservative.
    reservedPeriod = await reserveR2Budget(db, currentTime(), 1, putBytes, false)
  }
  throw budgetError(
    'The UTC month changed repeatedly while reserving R2 use. No R2 operation was started.',
  )
}

/** Reserves cleanup headroom before changing D1, so both prefix sweeps can complete safely. */
export async function reserveR2CleanupBudget(
  db: D1Database,
  now: number,
  operations = MAX_CLEANUP_LIST_RESERVATION,
  currentTime: () => number = () => now,
): Promise<R2CleanupBudget> {
  const period = await reserveR2Budget(db, now, operations, 0, true)
  return { period, remaining: operations, db, now: currentTime }
}

/** Releases any reserved-but-unused cleanup operation credits after the cleanup transaction. */
export async function releaseR2CleanupBudget(
  db: D1Database,
  budget: R2CleanupBudget,
): Promise<void> {
  if (budget.remaining === 0) return
  await db
    .prepare(
      `UPDATE r2_storage_budget
       SET monthly_operations = monthly_operations - ?
       WHERE id = 1 AND monthly_period = ? AND monthly_operations >= ?`,
    )
    .bind(budget.remaining, budget.period, budget.remaining)
    .run()
  budget.remaining = 0
}

/**
 * Charges the monthly PUT budget for a write before R2 is called. Throws 429 without any R2 call
 * when the budget refuses, so the caller knows the object was never written.
 */
export async function reserveR2Put(
  db: D1Database,
  currentTime: () => number,
  bytes: number,
): Promise<void> {
  await reserveBeforeR2Call(db, currentTime, {
    putBytes: Math.max(bytes, MIN_GLOBAL_R2_PUT_CHARGE_BYTES),
  })
}

export async function putOriginalFile(
  db: D1Database,
  bucket: R2Bucket,
  key: string,
  body: Uint8Array,
  options: R2PutOptions,
  currentTime: () => number,
) {
  await reserveR2Put(db, currentTime, body.byteLength)
  return bucket.put(key, body, options)
}

export async function getOriginalFile(
  db: D1Database,
  bucket: R2Bucket,
  key: string,
  currentTime: () => number,
) {
  await reserveBeforeR2Call(db, currentTime)
  return bucket.get(key)
}

/** Deletes every object under prefix, page by page. Used by test cleanup only. */
export async function deleteByPrefix(
  bucket: R2Bucket,
  prefix: string,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<number> {
  let deleted = 0
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix, cursor, limit: pageSize })
    const keys = page.objects.map((object) => object.key)
    if (keys.length > 0) {
      await bucket.delete(keys)
      deleted += keys.length
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor !== undefined)
  return deleted
}

/** Production cleanup uses prepaid LIST headroom; R2 deletes themselves are unmetered. */
export async function deleteByPrefixWithBudget(
  bucket: R2Bucket,
  prefix: string,
  budget: R2CleanupBudget,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<number> {
  let deleted = 0
  let cursor: string | undefined
  do {
    const currentPeriod = periodFor(budget.now())
    let reservedPeriod = budget.period
    if (currentPeriod !== budget.period) {
      // Cleanup spanning a UTC month boundary cannot use last month's prepaid credits.
      reservedPeriod = await reserveR2Budget(budget.db, budget.now(), 1, 0, true)
    } else {
      if (budget.remaining <= 0) {
        throw budgetError(
          'This cleanup needs more R2 LIST operations than the reserved headroom. Retry next month or have an operator review the storage budget.',
        )
      }
      budget.remaining -= 1
    }
    for (let transition = 0; periodFor(budget.now()) !== reservedPeriod; transition += 1) {
      if (transition === 2) {
        throw budgetError(
          'The UTC month changed repeatedly while reserving cleanup. No further R2 LIST was started.',
        )
      }
      // Retain the old reservation and reserve another call in the current month.
      reservedPeriod = await reserveR2Budget(budget.db, budget.now(), 1, 0, true)
    }
    const page = await bucket.list({ prefix, cursor, limit: pageSize })
    const keys = page.objects.map((object) => object.key)
    if (keys.length > 0) {
      await bucket.delete(keys)
      deleted += keys.length
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor !== undefined)
  return deleted
}

/** True when the user has any activity row that holds, or is reserving, an original file. */
export async function hasStoredFiles(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS found FROM activities
       WHERE user_id = ? AND (file_key IS NOT NULL OR file_size IS NOT NULL) LIMIT 1`,
    )
    .bind(userId)
    .first<{ found: number }>()
  return row !== null
}

/**
 * Removes every object under the user's prefix, reserving cleanup LIST headroom first. Callers
 * decide whether the user has objects at all, so accounts without files never spend the budget.
 */
export async function sweepUserFiles(
  db: D1Database,
  bucket: R2Bucket,
  userId: string,
  now: () => number,
): Promise<number> {
  const budget = await reserveR2CleanupBudget(db, now(), undefined, now)
  try {
    return await deleteByPrefixWithBudget(bucket, userFilePrefix(userId), budget)
  } finally {
    await releaseR2CleanupBudget(db, budget)
  }
}
