import {
  MAX_GLOBAL_R2_MONTHLY_OPERATIONS,
  MAX_GLOBAL_R2_STANDARD_OPERATIONS,
  MAX_GLOBAL_R2_WRITE_BYTES,
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

/** Atomically reserves a global R2 PUT/GET/LIST operation and optional lifetime PUT bytes. */
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
      `INSERT INTO r2_storage_budget (id, lifetime_put_bytes, monthly_period, monthly_operations)
       VALUES (1, 0, ?, 0) ON CONFLICT(id) DO NOTHING`,
    )
    .bind(period)
    .run()
  const reserved = await db
    .prepare(
      `UPDATE r2_storage_budget
       SET lifetime_put_bytes = lifetime_put_bytes + ?,
           monthly_period = CASE WHEN monthly_period < ? THEN ? ELSE monthly_period END,
           monthly_operations = CASE WHEN monthly_period < ? THEN ? ELSE monthly_operations + ? END
       WHERE id = 1
         AND monthly_period <= ?
         AND (monthly_period < ? OR monthly_operations + ? <= ?)
         AND (? = 0 OR lifetime_put_bytes + ? <= ?)
       RETURNING id`,
    )
    .bind(
      putBytes,
      period,
      period,
      period,
      operations,
      operations,
      period,
      period,
      operations,
      operationCap,
      putBytes,
      putBytes,
      MAX_GLOBAL_R2_WRITE_BYTES,
    )
    .first<{ id: number }>()
  if (reserved) return period

  const current = await db
    .prepare(
      'SELECT lifetime_put_bytes, monthly_period, monthly_operations FROM r2_storage_budget WHERE id = 1',
    )
    .first<{ lifetime_put_bytes: number; monthly_period: string; monthly_operations: number }>()
  if (
    !current ||
    (putBytes > 0 && current.lifetime_put_bytes + putBytes > MAX_GLOBAL_R2_WRITE_BYTES)
  ) {
    throw budgetError(
      'The deployment reached its 4 GiB lifetime original-file write limit. Further file writes are disabled until an operator reviews the storage budget.',
    )
  }
  if (current.monthly_period > period) {
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

export async function putOriginalFile(
  db: D1Database,
  bucket: R2Bucket,
  key: string,
  body: Uint8Array,
  options: R2PutOptions,
  currentTime: () => number,
) {
  await reserveBeforeR2Call(db, currentTime, {
    putBytes: Math.max(body.byteLength, MIN_GLOBAL_R2_PUT_CHARGE_BYTES),
  })
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
