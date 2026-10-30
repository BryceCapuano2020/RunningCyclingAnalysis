import { execFile as nodeExecFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const execFile = promisify(nodeExecFile)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const API_DIR = resolve(ROOT, 'apps/api')
const WRANGLER_CONFIG = resolve(API_DIR, 'wrangler.toml')
// ALLOWED_EMAILS is the sign-up list. Without it nobody new can create an account, so a deploy that
// lacks it fails here instead of quietly closing sign-up (existing accounts keep working either way).
const REQUIRED_SECRETS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'SESSION_SIGNING_KEY',
  'ALLOWED_EMAILS',
]

/** Validate only secret names; values must never be included in diagnostics. */
export function validateWorkerSecrets(stdout) {
  let entries
  try {
    entries = JSON.parse(stdout)
  } catch {
    throw new Error('Wrangler secret list returned an unreadable response.')
  }
  if (!Array.isArray(entries) || entries.some((entry) => typeof entry?.name !== 'string')) {
    throw new Error('Wrangler secret list returned an unexpected response.')
  }
  const names = new Set(entries.map((entry) => entry.name))
  const missing = REQUIRED_SECRETS.filter((name) => !names.has(name))
  return { missing }
}

export async function checkWorkerSecrets(execFileImpl = execFile) {
  let stdout
  try {
    ;({ stdout } = await execFileImpl(
      'npx',
      ['wrangler', 'secret', 'list', '--config', WRANGLER_CONFIG],
      { cwd: API_DIR, encoding: 'utf8', maxBuffer: 1024 * 1024 },
    ))
  } catch {
    throw new Error(
      'Could not list Worker secret names. Check Cloudflare credentials and permissions.',
    )
  }
  const { missing } = validateWorkerSecrets(stdout)
  if (missing.length > 0) {
    throw new Error(`Missing required Worker secrets: ${missing.join(', ')}.`)
  }
  return REQUIRED_SECRETS.length
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkWorkerSecrets()
    .then(() => console.log('Required Worker secret names are present.'))
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
