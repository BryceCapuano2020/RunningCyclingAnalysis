import { DATABASE_SOFT_LIMIT_BYTES } from '@rca/contract'

const MIB = 1024 * 1024
/** Below this a typo would block every create; above it the value exceeds D1 Paid's 10 GB. */
export const MIN_DATABASE_LIMIT_MIB = 64
export const MAX_DATABASE_LIMIT_MIB = 9 * 1024

/**
 * The database size at which creates are refused. The default is the Workers Free figure
 * (DATABASE_SOFT_LIMIT_BYTES, 450 MiB of D1's 500 MB). On Workers Paid, where D1 holds 10 GB, the
 * deployment may raise it with the plain variable DATABASE_SOFT_LIMIT_MIB, leaving about 10 percent
 * of the plan's limit free. Anything that is not a whole number in range falls back to the default,
 * so a typo can only keep the safe cap, never remove it.
 */
export function databaseSoftLimitBytes(env: { DATABASE_SOFT_LIMIT_MIB?: string }): number {
  // A wrangler var written without quotes arrives as a number, so it is read as text first.
  const raw = String(env.DATABASE_SOFT_LIMIT_MIB ?? '').trim()
  if (!raw || !/^\d{1,5}$/.test(raw)) return DATABASE_SOFT_LIMIT_BYTES
  const mib = Number(raw)
  if (mib < MIN_DATABASE_LIMIT_MIB || mib > MAX_DATABASE_LIMIT_MIB) return DATABASE_SOFT_LIMIT_BYTES
  return mib * MIB
}
