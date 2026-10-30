import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { parseTombstones, reconcileFile, reconcileSql } from './reconcile-restore.mjs'

const migrations = new URL('../../apps/api/migrations/', import.meta.url)
const journal = JSON.parse(await readFile(new URL('meta/_journal.json', migrations), 'utf8'))

const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'
const CARA = '33333333-3333-4333-8333-333333333333'
const DAN = '44444444-4444-4444-8444-444444444444'
const GONE = '55555555-5555-4555-8555-555555555555'

/** The restored copy: it still has Alice (deleted since), Cara (mid-deletion), Bob and Dan. */
async function restoredCopy() {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const { tag } of journal.entries) {
    db.exec(await readFile(new URL(`${tag}.sql`, migrations), 'utf8'))
  }
  const user = db.prepare(
    'INSERT INTO users (id, email, name, picture_url, created_at, deleting_at) VALUES (?, ?, ?, NULL, 1, ?)',
  )
  user.run(ALICE, 'a@example.test', 'A', null)
  user.run(BOB, 'b@example.test', 'B', null)
  user.run(CARA, 'c@example.test', 'C', 7)
  user.run(DAN, 'd@example.test', 'D', null)
  const session = db.prepare(
    'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, 9999999999999, 1)',
  )
  for (const id of [ALICE, BOB, DAN]) session.run(`s-${id}`, id)
  db.prepare(
    "INSERT INTO daily_budget (user_id, day, action, used) VALUES (?, '2026-01-01', 'read', 1)",
  ).run(ALICE)
  return db
}

const ids = (db, table) =>
  db
    .prepare(`SELECT user_id AS id FROM ${table} ORDER BY 1`)
    .all()
    .map((r) => r.id)

test('deletes accounts deleted after the copy and finishes ones it shows mid-deletion', async () => {
  const db = await restoredCopy()
  try {
    const tombstones = parseTombstones(
      JSON.stringify([
        { user_id: ALICE, deleted_at: 5 },
        { user_id: GONE, deleted_at: 6 },
      ]),
    )
    db.exec(reconcileSql(tombstones))
    assert.deepEqual(
      db
        .prepare('SELECT id FROM users ORDER BY id')
        .all()
        .map((r) => r.id),
      [BOB, DAN],
    )
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM daily_budget').get().n, 0, 'cascade')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0)
    assert.deepEqual(
      db
        .prepare('SELECT user_id, deleted_at FROM account_tombstones ORDER BY user_id')
        .all()
        .map((r) => [r.user_id, r.deleted_at]),
      [
        [ALICE, 5],
        [CARA, 7],
        [GONE, 6],
      ],
    )
    // Running it again changes nothing.
    db.exec(reconcileSql(tombstones))
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 2)
    assert.equal(ids(db, 'account_tombstones').length, 3)
  } finally {
    db.close()
  }
})

test('with no tombstone rows it still finishes mid-deletion accounts and clears sessions', async () => {
  const db = await restoredCopy()
  try {
    db.exec(reconcileSql([]))
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 3)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0)
  } finally {
    db.close()
  }
})

test('reads the wrangler --json shape and a plain list, and drops duplicates', () => {
  const wrangler = JSON.stringify([
    { results: [{ user_id: ALICE, deleted_at: 5 }], success: true, meta: {} },
  ])
  assert.deepEqual(parseTombstones(wrangler), [{ userId: ALICE, deletedAt: 5 }])
  const twice = JSON.stringify([
    { user_id: ALICE.toUpperCase(), deleted_at: 5 },
    { user_id: ALICE, deleted_at: 6 },
  ])
  assert.equal(parseTombstones(twice).length, 1)
})

test('rejects ids and times that are not what a tombstone holds, so no SQL can be injected', () => {
  for (const row of [
    { user_id: "x'); DROP TABLE users; --", deleted_at: 1 },
    { user_id: ALICE, deleted_at: '1; DELETE FROM sessions' },
    { user_id: ALICE, deleted_at: 1.5 },
    { user_id: ALICE, deleted_at: -1 },
    { user_id: 7, deleted_at: 1 },
  ]) {
    assert.throws(() => parseTombstones(JSON.stringify([row])), /invalid/)
  }
  assert.throws(() => parseTombstones('not json'), /not JSON/)
  assert.throws(() => parseTombstones('{"user_id":"x"}'), /not a list/)
})

test('writes a private new file and refuses to overwrite one', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rca-reconcile-'))
  try {
    const input = join(dir, 'tombstones.json')
    const output = join(dir, 'reconcile.sql')
    await writeFile(input, JSON.stringify([{ user_id: ALICE, deleted_at: 5 }]))
    const result = await reconcileFile(input, output)
    assert.equal(result.tombstones, 1)
    assert.equal((await stat(output)).mode & 0o777, 0o600)
    assert.match(await readFile(output, 'utf8'), /DELETE FROM users WHERE id IN/)
    await assert.rejects(reconcileFile(input, output), /already exists/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
