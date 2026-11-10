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
  checkServerState(config, readString('SERVER_COMPUTE_USERS'))
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
 * Results computed on the server (docs/design/server-compute.md) need Workers Paid, which the owner has not upgraded to, and
 * run for the accounts listed in SERVER_COMPUTE_USERS only. While the list is empty the production configuration binds no
 * queue at all (no producer, no consumer, no limits block), so a deploy cannot create or consume one. A list that names
 * accounts must bind the STATE_QUEUE producer, a consumer with a small batch, a retry limit and a dead-letter queue, and
 * cap CPU; `*` (everyone) is for local tests and never goes in production.
 */
function checkServerState(config, value) {
  const accounts = (value ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  const queues = /^\[\[queues\./m.test(config) || /^\[queues\b/m.test(config)
  if (accounts.length === 0) {
    if (queues || /^\[limits\]/m.test(config)) {
      throw new Error(
        'SERVER_COMPUTE_USERS is empty, so apps/api/wrangler.toml must bind no queue and set no [limits]. Remove them, or list the accounts with Workers Paid.',
      )
    }
    return
  }
  if (accounts.includes('*')) {
    throw new Error('SERVER_COMPUTE_USERS must list account ids in production, not *.')
  }
  const producer =
    /^\[\[queues\.producers\]\]\s*\n(?:(?!\[\[).)*?^binding\s*=\s*["']STATE_QUEUE["']/ms.test(
      config,
    )
  const consumer = config.match(/^\[\[queues\.consumers\]\]\s*\n((?:(?!\[\[).)*)/ms)?.[1] ?? null
  const hasKey = (key) => consumer !== null && new RegExp(`^${key}\\s*=`, 'm').test(consumer)
  const cpu = /^\[limits\]\s*\n(?:(?!\[).)*?^cpu_ms\s*=\s*\d+/ms.test(config)
  if (!(producer && consumer !== null && cpu)) {
    throw new Error(
      'SERVER_COMPUTE_USERS names accounts, so apps/api/wrangler.toml must bind the STATE_QUEUE producer and its consumer, and set [limits] cpu_ms.',
    )
  }
  if (!(hasKey('max_batch_size') && hasKey('max_retries') && hasKey('dead_letter_queue'))) {
    throw new Error(
      'The state queue consumer must set max_batch_size, max_retries and dead_letter_queue.',
    )
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
