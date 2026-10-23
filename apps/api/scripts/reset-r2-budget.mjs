import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Caps the reset may set, matching packages/contract limits (see apps/api/LIMITS.md). */
const MAX_PUT_BYTES = 2 * 1024 * 1024 * 1024
const MAX_OPERATIONS = 100_000

/**
 * SQL that sets the current UTC month's R2 counters, for an operator to run with
 * `wrangler d1 execute rca --remote --command "<sql>"` after reviewing usage in the dashboard.
 * It only applies when the stored month equals `period`, so it cannot rewind another month. The
 * lifetime audit total is never changed.
 */
export function buildResetSql({ period, putBytes = 0, operations = 0 }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('--period must be YYYY-MM (UTC).')
  for (const [name, value, max] of [
    ['--put-bytes', putBytes, MAX_PUT_BYTES],
    ['--operations', operations, MAX_OPERATIONS],
  ]) {
    if (!Number.isSafeInteger(value) || value < 0 || value > max) {
      throw new Error(`${name} must be an integer from 0 to ${max}.`)
    }
  }
  return `UPDATE r2_storage_budget SET monthly_put_bytes = ${putBytes}, monthly_operations = ${operations} WHERE id = 1 AND monthly_period = '${period}';`
}

function parseArgs(argv) {
  const options = { period: undefined, putBytes: 0, operations: 0 }
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (value === undefined) throw new Error(`${flag} needs a value.`)
    if (flag === '--period') options.period = value
    else if (flag === '--put-bytes') options.putBytes = Number(value)
    else if (flag === '--operations') options.operations = Number(value)
    else throw new Error(`Unknown option ${flag}.`)
  }
  if (options.period === undefined) throw new Error('--period YYYY-MM is required.')
  return options
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(buildResetSql(parseArgs(process.argv.slice(2))))
  } catch (error) {
    console.error(
      `Usage: node apps/api/scripts/reset-r2-budget.mjs --period YYYY-MM [--put-bytes N] [--operations N]\n${error.message}`,
    )
    process.exitCode = 2
  }
}
