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
