import test from 'node:test'
import assert from 'node:assert/strict'
import { checkMigrations, parsePendingMigrations } from './check-migrations.mjs'

const noneOutput = '⛅️ wrangler 4.151.3\n-------------------\n\n✅ No migrations to apply!\n'
const pendingOutput = `⛅️ wrangler 4.151.3
-------------------

Migrations to be applied:
┌────────────────────────────┐
│ Name                       │
├────────────────────────────┤
│ 0008_file_bytes.sql        │
├────────────────────────────┤
│ 0009_example_change.sql    │
└────────────────────────────┘
`

test('no pending migrations parses to an empty list', () => {
  assert.deepEqual(parsePendingMigrations(noneOutput), { pending: [] })
})

test('pending migrations are named in the order Wrangler lists them', () => {
  assert.deepEqual(parsePendingMigrations(pendingOutput), {
    pending: ['0008_file_bytes.sql', '0009_example_change.sql'],
  })
})

test('unrecognised migration output fails closed', () => {
  assert.throws(() => parsePendingMigrations('not a migration list'), /unexpected response/)
  assert.throws(
    () => parsePendingMigrations('Migrations to be applied:\n│ Name │\n'),
    /unexpected response/,
  )
})

test('deploy proceeds when no migrations are pending', async () => {
  let invocation
  assert.equal(
    await checkMigrations(async (...args) => {
      invocation = args
      return { stdout: noneOutput }
    }),
    undefined,
  )
  assert.equal(invocation[0], 'npx')
  assert.deepEqual(invocation[1].slice(0, 6), [
    'wrangler',
    'd1',
    'migrations',
    'list',
    'rca',
    '--remote',
  ])
  assert.equal(invocation[1][6], '--config')
  assert.ok(invocation[1][7].startsWith('/'))
  assert.ok(invocation[1][7].endsWith('/apps/api/wrangler.toml'))
})

test('deploy is refused and names pending migrations', async () => {
  await assert.rejects(
    checkMigrations(async () => ({ stdout: pendingOutput })),
    (error) => {
      assert.match(error.message, /0008_file_bytes\.sql, 0009_example_change\.sql/)
      assert.match(error.message, /Apply them first: npx wrangler d1 migrations apply rca --remote/)
      return true
    },
  )
})

test('deploy is refused when the migration list cannot run', async () => {
  await assert.rejects(
    checkMigrations(async () => {
      const error = new Error('command failed with SECRET_VALUE')
      error.stderr = 'SECRET_VALUE'
      throw error
    }),
    (error) => {
      assert.match(error.message, /Could not list remote D1 migrations/)
      assert.match(error.message, /Deploy did not run/)
      assert.doesNotMatch(error.message, /SECRET_VALUE/)
      return true
    },
  )
})
