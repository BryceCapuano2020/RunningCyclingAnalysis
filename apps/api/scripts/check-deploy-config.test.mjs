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
test('with the list empty and nothing bound the configuration passes, as it does with the list in a secret', () => {
  assert.doesNotThrow(() => validateDeployConfig(`${valid}\nSERVER_COMPUTE_USERS = ""`))
  assert.doesNotThrow(() => validateDeployConfig(valid))
  assert.doesNotThrow(() => validateDeployConfig(`${valid}\n# [[queues.producers]]`))
})
test('with the list empty (the owner is in a secret) a queue or limit is accepted only as the whole bounded set', () => {
  const lists = ['', 'SERVER_COMPUTE_USERS = ""\n', 'SERVER_COMPUTE_USERS = " , "\n']
  for (const list of lists) {
    assert.doesNotThrow(() => validateDeployConfig(list + valid + producer + consumer + limits))
    for (const part of [producer, consumer, limits, producer + consumer, consumer + limits]) {
      assert.throws(() => validateDeployConfig(list + valid + part), /as a set/)
    }
  }
})
test('a list of accounts binds the producer, a bounded consumer with a dead-letter queue, and a CPU cap', () => {
  const on = `${valid}\nSERVER_COMPUTE_USERS = "u1, u2"`
  assert.doesNotThrow(() => validateDeployConfig(on + producer + consumer + limits))
  assert.throws(() => validateDeployConfig(on), /as a set/)
  assert.throws(() => validateDeployConfig(on + producer + consumer), /as a set/)
  assert.throws(() => validateDeployConfig(on + consumer + limits), /as a set/)
  assert.throws(() => validateDeployConfig(on + producer + limits), /as a set/)
  for (const key of ['max_batch_size', 'max_concurrency', 'max_retries', 'dead_letter_queue']) {
    const lacking = consumer.replace(new RegExp(`\\n${key}.*`), '')
    assert.throws(() => validateDeployConfig(on + producer + lacking + limits), new RegExp(key))
    assert.throws(() => validateDeployConfig(valid + producer + lacking + limits), new RegExp(key))
  }
})
test('the consumer runs one at a time', () => {
  const wide = consumer.replace('max_concurrency = 1', 'max_concurrency = 5')
  assert.throws(() => validateDeployConfig(valid + producer + wide + limits), /max_concurrency = 1/)
})
test('production never lists everyone', () => {
  const star = `${valid}\nSERVER_COMPUTE_USERS = "*"`
  assert.throws(() => validateDeployConfig(star + producer + consumer + limits), /not \*/)
})
test('the committed production configuration lists no account and binds the whole bounded set', async () => {
  const { readFile } = await import('node:fs/promises')
  const config = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8')
  // Accounts come from the SERVER_COMPUTE_ACCOUNTS secret only, never the repository.
  assert.match(config, /^SERVER_COMPUTE_USERS = ""/m)
  assert.match(config, /^\[\[queues\.producers\]\]/m)
  assert.match(config, /^\[limits\]\s*\ncpu_ms = 10000/m)
  assert.doesNotThrow(() => validateDeployConfig(config))
})
