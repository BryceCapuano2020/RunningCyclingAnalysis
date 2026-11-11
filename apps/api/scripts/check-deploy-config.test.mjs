import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateDeployConfig } from './check-deploy-config.mjs'

const valid = `database_id = "12345678-1234-1234-1234-123456789abc"
[[r2_buckets]]
binding = "FILES"
bucket_name = "rca-files"
[vars]
ENVIRONMENT = "production"
APP_URL = "https://rca-api.owner.workers.dev"`

test('accepts a configured HTTPS production origin and real database id', () => {
  assert.doesNotThrow(() => validateDeployConfig(valid))
})
test('blocks placeholder, absent, and malformed database ids, including bootstrap', () => {
  for (const id of ['', '00000000-0000-0000-0000-000000000000', 'typo']) {
    const config = valid.replace('12345678-1234-1234-1234-123456789abc', id)
    assert.throws(() => validateDeployConfig(config), /database_id/)
    assert.throws(
      () => validateDeployConfig(config, { allowUnconfiguredOrigin: true }),
      /database_id/,
    )
  }
})
test('requires the dedicated production R2 binding and bucket', () => {
  assert.throws(() => validateDeployConfig(valid.replace('rca-files', 'other-bucket')), /rca-files/)
  assert.throws(
    () => validateDeployConfig(valid.replace('binding = "FILES"', 'binding = "OTHER"')),
    /FILES/,
  )
  assert.throws(() => validateDeployConfig(valid.replace('[[r2_buckets]]\n', '')), /FILES/)
})
test('rejects missing, placeholder, insecure, local, and non-origin callback settings', () => {
  for (const origin of [
    '',
    'https://example.invalid',
    'http://live.example.org',
    'https://localhost',
    'https://127.0.0.1',
    'https://[::1]',
    'https://live.example.org/',
    'https://live.example.org/path',
    'https://live.example.org?x=1',
    'https://user:password@live.example.org',
  ]) {
    assert.throws(
      () => validateDeployConfig(valid.replace('https://rca-api.owner.workers.dev', origin)),
      /APP_URL/,
    )
  }
})
test('rejects production configuration that enables development login', () => {
  assert.throws(
    () => validateDeployConfig(valid.replace('production', 'development')),
    /ENVIRONMENT/,
  )
})
test('allows an unconfigured origin only in explicit bootstrap mode', () => {
  const bootstrap = valid.replace('https://rca-api.owner.workers.dev', 'https://example.invalid')
  assert.throws(() => validateDeployConfig(bootstrap), /APP_URL/)
  assert.doesNotThrow(() => validateDeployConfig(bootstrap, { allowUnconfiguredOrigin: true }))
})
test('accepts ordinary comments and single quoted values', () => {
  assert.doesNotThrow(() => validateDeployConfig(valid.replaceAll('"', "'") + ' # public origin\n'))
})

const producer = `
[[queues.producers]]
binding = "STATE_QUEUE"
queue = "rca-state"`
const consumer = `
[[queues.consumers]]
queue = "rca-state"
max_batch_size = 2
max_concurrency = 1
max_retries = 3
dead_letter_queue = "rca-state-dlq"`
const limits = `
[limits]
cpu_ms = 10000`
test('with nothing bound the configuration passes', () => {
  assert.doesNotThrow(() => validateDeployConfig(valid))
  assert.doesNotThrow(() => validateDeployConfig(`${valid}\n# [[queues.producers]]`))
})
test('a queue or limit is accepted only as the whole bounded set', () => {
  assert.doesNotThrow(() => validateDeployConfig(valid + producer + consumer + limits))
  for (const part of [producer, consumer, limits, producer + consumer, consumer + limits]) {
    assert.throws(() => validateDeployConfig(valid + part), /as a set/)
  }
})
test('the consumer needs a batch size, one at a time, a retry limit and a dead-letter queue', () => {
  for (const key of ['max_batch_size', 'max_concurrency', 'max_retries', 'dead_letter_queue']) {
    const lacking = consumer.replace(new RegExp(`\\n${key}.*`), '')
    assert.throws(() => validateDeployConfig(valid + producer + lacking + limits), new RegExp(key))
  }
})
test('the consumer runs one at a time', () => {
  const wide = consumer.replace('max_concurrency = 1', 'max_concurrency = 5')
  assert.throws(() => validateDeployConfig(valid + producer + wide + limits), /max_concurrency = 1/)
})
test('the committed production configuration binds the whole bounded set and names no account list', async () => {
  const { readFile } = await import('node:fs/promises')
  const config = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8')
  assert.doesNotMatch(config, /SERVER_COMPUTE/)
  assert.match(config, /^\[\[queues\.producers\]\]/m)
  assert.match(config, /^\[limits\]\s*\ncpu_ms = 10000/m)
  assert.doesNotThrow(() => validateDeployConfig(config))
})

test('Garmin sync stays off in production until its release (garmin-sync.md G6)', () => {
  for (const value of ['true', 'on', '1', ' TRUE ']) {
    assert.throws(
      () => validateDeployConfig(`${valid}\nGARMIN_ENABLED = "${value}"`),
      /GARMIN_ENABLED/,
    )
  }
  assert.throws(() => validateDeployConfig(`${valid}\nGARMIN_ENABLED = true`), /GARMIN_ENABLED/)
  assert.doesNotThrow(() => validateDeployConfig(`${valid}\nGARMIN_ENABLED = ""`))
  assert.doesNotThrow(() => validateDeployConfig(`${valid}\nGARMIN_ENABLED = "false"`))
})
