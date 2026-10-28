import { execFile as nodeExecFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const execFile = promisify(nodeExecFile)
const API_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WRANGLER_CONFIG = resolve(API_DIR, 'wrangler.toml')
const DATABASE = 'rca'
const PENDING_MARKER = 'Migrations to be applied:'
const NONE_MARKER = 'No migrations to apply'

/**
 * Read `wrangler d1 migrations list` output. Anything unrecognised fails closed, so a changed
 * Wrangler message cannot make a pending migration look like none.
 */
export function parsePendingMigrations(stdout) {
  if (stdout.includes(NONE_MARKER)) return { pending: [] }
  const index = stdout.indexOf(PENDING_MARKER)
  if (index < 0) {
    throw new Error('Wrangler migration list returned an unexpected response.')
  }
  const names = [
    ...new Set(stdout.slice(index + PENDING_MARKER.length).match(/[\w.-]+\.sql\b/g) ?? []),
  ]
  if (names.length === 0) {
    throw new Error('Wrangler migration list returned an unexpected response.')
  }
  return { pending: names }
}

/** Refuse to deploy while remote D1 migrations are pending. Errors never echo Wrangler output. */
export async function checkMigrations(execFileImpl = execFile) {
  let stdout
  try {
    ;({ stdout } = await execFileImpl(
      'npx',
      ['wrangler', 'd1', 'migrations', 'list', DATABASE, '--remote', '--config', WRANGLER_CONFIG],
      { cwd: API_DIR, encoding: 'utf8', maxBuffer: 1024 * 1024 },
    ))
  } catch {
    throw new Error(
      'Could not list remote D1 migrations. Check Cloudflare credentials and permissions. Deploy did not run.',
    )
  }
  const { pending } = parsePendingMigrations(stdout)
  if (pending.length > 0) {
    throw new Error(
      `Pending D1 migrations: ${pending.join(', ')}. Apply them first: npx wrangler d1 migrations apply rca --remote`,
    )
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkMigrations()
    .then(() => console.log('No pending remote D1 migrations.'))
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
