import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Validate the simple, quoted production settings used by this repository's Wrangler config. */
export function validateDeployConfig(config, { allowUnconfiguredOrigin = false } = {}) {
  const readString = (name) =>
    config.match(new RegExp(`^${name}\\s*=\\s*["']([^"']*)["']\\s*(?:#.*)?$`, 'm'))?.[1]
  const databaseId = readString('database_id')
  if (
    !databaseId ||
    !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(databaseId) ||
    /^0+$/.test(databaseId.replaceAll('-', ''))
  ) {
    throw new Error(
      'Set the real D1 database_id in apps/api/wrangler.toml before any remote operation.',
    )
  }
  if (
    !/^\[\[r2_buckets\]\]\s*\n(?:(?!\[\[).)*?^binding\s*=\s*["']FILES["']\s*\n(?:(?!\[\[).)*?^bucket_name\s*=\s*["']rca-files["']/ms.test(
      config,
    )
  ) {
    throw new Error(
      'Configure the dedicated production R2 bucket as binding="FILES" and bucket_name="rca-files" in apps/api/wrangler.toml.',
    )
  }
  checkServerState(config)
  // Garmin sync is built switched off (docs/design/garmin-sync.md); its release (G6) is the change that removes this.
  // Read quoted or not: an unquoted `true` is a TOML boolean, which the Worker reads as on.
  const set = /^GARMIN_ENABLED\s*=\s*(?:["']([^"']*)["']|([^\s#]+))/m.exec(config)
  const garmin = set?.[1] ?? set?.[2] ?? ''
  if (['true', '1', 'on'].includes(garmin.trim().toLowerCase())) {
    throw new Error(
      'GARMIN_ENABLED stays off in production until the Garmin release (garmin-sync.md G6).',
    )
  }
  if (allowUnconfiguredOrigin) return
  const origin = readString('APP_URL')
  let url
  try {
    url = new URL(origin)
  } catch {
    /* Report one actionable configuration error below. */
  }
  if (
    !url ||
    url.protocol !== 'https:' ||
    url.origin !== origin ||
    url.username ||
    url.password ||
    url.hostname.endsWith('.invalid') ||
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]' ||
    readString('ENVIRONMENT') !== 'production'
  ) {
    throw new Error(
      'Set ENVIRONMENT="production" and APP_URL to the real HTTPS origin (no path or trailing slash). Use deploy:bootstrap only for the initial address discovery.',
    )
  }
}

/**
 * Results computed on the server (docs/design/server-authority.md) need Workers Paid and run for every signed-in account.
 * The queue and [limits] blocks must be present and be the whole, bounded set, since every account depends on them: the STATE_QUEUE producer, a consumer with a small batch, one
 * at a time, a retry limit and a dead-letter queue, and a CPU cap.
 */
function checkServerState(config) {
  const producer =
    /^\[\[queues\.producers\]\]\s*\n(?:(?!\[\[).)*?^binding\s*=\s*["']STATE_QUEUE["']/ms.test(
      config,
    )
  const consumer = config.match(/^\[\[queues\.consumers\]\]\s*\n((?:(?!\[\[).)*)/ms)?.[1] ?? null
  const hasKey = (key) => consumer !== null && new RegExp(`^${key}\\s*=`, 'm').test(consumer)
  const cpu = /^\[limits\]\s*\n(?:(?!\[).)*?^cpu_ms\s*=\s*\d+/ms.test(config)
  if (!(producer && consumer !== null && cpu)) {
    throw new Error(
      'Server results are bound only as a set: apps/api/wrangler.toml must have the STATE_QUEUE producer, its consumer, and [limits] cpu_ms, together.',
    )
  }
  const bounds = ['max_batch_size', 'max_concurrency', 'max_retries', 'dead_letter_queue']
  if (!bounds.every(hasKey)) {
    throw new Error(
      'The state queue consumer must set max_batch_size, max_concurrency, max_retries and dead_letter_queue.',
    )
  }
  if (!/^max_concurrency\s*=\s*1\s*(?:#.*)?$/m.test(consumer)) {
    throw new Error('The state queue consumer must set max_concurrency = 1.')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config = await readFile(
      fileURLToPath(new URL('../wrangler.toml', import.meta.url)),
      'utf8',
    )
    validateDeployConfig(config, { allowUnconfiguredOrigin: process.argv.includes('--bootstrap') })
  } catch (error) {
    console.error(`Refusing remote operation: ${error.message}`)
    process.exitCode = 1
  }
}
