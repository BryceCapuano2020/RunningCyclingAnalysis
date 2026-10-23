import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildManifest } from './make-manifest.mjs'

const TABLES = [
  'activities',
  'oauth_accounts',
  'profiles',
  'r2_storage_budget',
  'sessions',
  'users',
  'd1_migrations',
]

/** A minimal export with every table the restore helper requires, and two users. */
const EXPORT_SQL = [
  ...TABLES.map((name) => `CREATE TABLE ${name} (id TEXT PRIMARY KEY);`),
  "INSERT INTO users (id) VALUES ('u1');",
  "INSERT INTO users (id) VALUES ('u2');",
  "INSERT INTO sessions (id) VALUES ('s1');",
].join('\n')

const OBJECTS = [
  { Key: 'users/u2/a', Size: 10, ETag: '"e2"', LastModified: '2026-10-21T00:00:00.000Z' },
  { Key: 'users/u1/b', Size: 5, ETag: '"e1"', LastModified: '2026-10-20T00:00:00.000Z' },
]

test('counts rows per table and sorts R2 objects by key', () => {
  const manifest = buildManifest({
    exportSql: EXPORT_SQL,
    r2Objects: OBJECTS,
    commit: 'abc',
    runId: '7',
    createdAt: '2026-10-22T04:05:00.000Z',
  })
  assert.equal(manifest.schema, 'rca-backup-manifest/v1')
  assert.equal(manifest.d1.rows.users, 2)
  assert.equal(manifest.d1.rows.sessions, 1)
  assert.equal(manifest.d1.rows.activities, 0)
  assert.deepEqual(
    manifest.r2.objects.map((object) => object.key),
    ['users/u1/b', 'users/u2/a'],
  )
  assert.equal(manifest.r2.objectCount, 2)
  assert.equal(manifest.r2.totalBytes, 15)
})

test('records a SHA-256 of the export so the archive can be checked against it', () => {
  const manifest = buildManifest({
    exportSql: EXPORT_SQL,
    r2Objects: [],
    commit: 'abc',
    runId: '7',
    createdAt: '2026-10-22T04:05:00.000Z',
  })
  assert.match(manifest.d1.sha256, /^[0-9a-f]{64}$/)
  assert.equal(manifest.r2.objectCount, 0)
})

test('refuses an export that contains a table outside the known schema', () => {
  const unknown = `${EXPORT_SQL}\nCREATE TABLE secrets (id TEXT);`
  assert.throws(
    () =>
      buildManifest({
        exportSql: unknown,
        r2Objects: [],
        commit: 'abc',
        runId: '7',
        createdAt: '2026-10-22T04:05:00.000Z',
      }),
    /unsupported table: secrets/,
  )
})

test('refuses an export that is missing a required table', () => {
  const partial = TABLES.slice(1)
    .map((name) => `CREATE TABLE ${name} (id TEXT PRIMARY KEY);`)
    .join('\n')
  assert.throws(
    () =>
      buildManifest({
        exportSql: partial,
        r2Objects: [],
        commit: 'abc',
        runId: '7',
        createdAt: '2026-10-22T04:05:00.000Z',
      }),
    /missing required table: activities/,
  )
})
