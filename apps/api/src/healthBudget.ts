import { HttpError } from './errors.ts'

/** Public deep-health probes are capped independently of ordinary application R2 traffic. */
export const MAX_HEALTH_PROBES_PER_DAY = 300
export const MAX_HEALTH_PROBES_PER_MONTH = 9_300

/** Reserves one global probe before the R2 HEAD, or throws 429 once either ceiling is reached. */
export async function reserveHealthProbe(db: D1Database, now: number): Promise<void> {
  const date = new Date(now)
  const day = date.toISOString().slice(0, 10)
  const month = date.toISOString().slice(0, 7)
  await db
    .prepare(
      `INSERT INTO r2_storage_budget (
         id, lifetime_put_bytes, monthly_period, monthly_operations, monthly_put_bytes,
         health_probe_day, health_probe_day_count, health_probe_month, health_probe_month_count
       ) VALUES (1, 0, ?, 0, 0, ?, 0, ?, 0)
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(month, day, month)
    .run()

  const reserved = await db
    .prepare(
      `UPDATE r2_storage_budget
       SET health_probe_day_count =
             CASE WHEN health_probe_day < ?1 THEN 1 ELSE health_probe_day_count + 1 END,
           health_probe_day = ?1,
           health_probe_month_count =
             CASE WHEN health_probe_month < ?2 THEN 1 ELSE health_probe_month_count + 1 END,
           health_probe_month = ?2
       WHERE id = 1
         AND health_probe_day <= ?1
         AND health_probe_month <= ?2
         AND (health_probe_day < ?1 OR health_probe_day_count < ?3)
         AND (health_probe_month < ?2 OR health_probe_month_count < ?4)
       RETURNING id`,
    )
    .bind(day, month, MAX_HEALTH_PROBES_PER_DAY, MAX_HEALTH_PROBES_PER_MONTH)
    .first<{ id: number }>()
  if (reserved) return

  const current = await db
    .prepare(
      `SELECT health_probe_day, health_probe_day_count, health_probe_month,
              health_probe_month_count
       FROM r2_storage_budget WHERE id = 1`,
    )
    .first<{
      health_probe_day: string
      health_probe_day_count: number
      health_probe_month: string
      health_probe_month_count: number
    }>()

  // A clock behind persisted state means the deployment clock or database needs attention.
  if (!current || current.health_probe_day > day || current.health_probe_month > month) {
    throw new HttpError(503, 'service_unavailable', 'Service is temporarily unavailable')
  }

  const monthLimitReached =
    current.health_probe_month === month &&
    current.health_probe_month_count >= MAX_HEALTH_PROBES_PER_MONTH
  const retryAt = monthLimitReached
    ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
    : Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
  throw new HttpError(
    429,
    'health_probe_limit',
    'The deep health probe limit has been reached. Try again after the budget resets.',
    { retryAfter: Math.max(1, Math.ceil((retryAt - now) / 1000)) },
  )
}
