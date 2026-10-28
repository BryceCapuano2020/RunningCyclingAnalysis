import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm, stat, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import {
  MAX_D1_EXPORT_BYTES,
  prepareD1RestoreFile,
  prepareD1RestoreSql,
} from './prepare-d1-restore.mjs'

const schema = `
PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT NOT NULL);
CREATE TABLE activities (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), digest TEXT);
CREATE TABLE oauth_accounts (provider TEXT NOT NULL, provider_user_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(provider, provider_user_id));
CREATE TABLE profiles (user_id TEXT PRIMARY KEY REFERENCES users(id), units TEXT);
CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id));
CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, picture_url TEXT, created_at INTEGER NOT NULL, raw BLOB);
CREATE TABLE r2_storage_budget (id INTEGER PRIMARY KEY, lifetime_put_bytes INTEGER NOT NULL, monthly_period TEXT NOT NULL, monthly_operations INTEGER NOT NULL);
CREATE UNIQUE INDEX users_email_unique ON users(email);
CREATE TRIGGER user_tag AFTER INSERT ON users BEGIN UPDATE users SET name = name || ' (imported)' WHERE id = new.id; END;
INSERT INTO activities VALUES ('act-1', 'user-1', 'digest ''quoted''');
INSERT INTO oauth_accounts VALUES ('google', 'google-1', 'user-1');
INSERT INTO profiles VALUES ('user-1', 'metric');
INSERT INTO sessions VALUES ('session-1', 'user-1');
INSERT INTO users VALUES ('user-1', 'o''hara@example.test', 'Alex', NULL, 9007199254740993, X'00ff10');
INSERT INTO r2_storage_budget VALUES (1, 9007199254740993, '2026-10', 321);
INSERT INTO d1_migrations(name, applied_at) VALUES ('0000_init', '2026-10-22');
DELETE FROM sqlite_sequence;
INSERT INTO sqlite_sequence(name, seq) VALUES ('d1_migrations', 77);
`

function inspect(sql, fn) {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec('PRAGMA foreign_keys=ON;')
    db.exec(sql)
    return fn(db)
  } finally {
    db.close()
  }
}

test('rewrites child-first D1 exports into schema-first parent order and preserves typed values', () => {
  const prepared = prepareD1RestoreSql(schema)
  assert.doesNotMatch(prepared, /PRAGMA foreign_keys|BEGIN TRANSACTION|COMMIT;/)
  const firstInsert = prepared.indexOf('INSERT INTO')
  assert.ok(firstInsert > 0)
  assert.ok(prepared.indexOf('CREATE TABLE users') < firstInsert)
  assert.ok(prepared.indexOf('INSERT INTO "users"') < prepared.indexOf('INSERT INTO "activities"'))
  assert.ok(
    prepared.indexOf('INSERT INTO "d1_migrations"') < prepared.indexOf('CREATE UNIQUE INDEX'),
  )
  assert.ok(prepared.indexOf('CREATE TRIGGER') > prepared.indexOf('INSERT INTO "activities"'))
  assert.match(prepared, /'o''hara@example\.test'/)
  assert.match(prepared, /X'00ff10'/)
  assert.match(prepared, /INSERT INTO sqlite_sequence\(name, seq\) VALUES \('d1_migrations', 77\)/)

  inspect(prepared, (db) => {
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1)
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
    const userStatement = db.prepare('SELECT email, name, picture_url, created_at, raw FROM users')
    userStatement.setReadBigInts(true)
    const user = userStatement.get()
    assert.equal(user.email, "o'hara@example.test")
    // The export's own trigger does not run over rows it already holds, so the stored name stays.
    assert.equal(user.name, 'Alex')
    assert.equal(user.picture_url, null)
    assert.equal(user.created_at, 9007199254740993n)
    assert.deepEqual([...user.raw], [0, 255, 16])
    const budget = db.prepare(
      'SELECT lifetime_put_bytes, monthly_period, monthly_operations FROM r2_storage_budget',
    )
    budget.setReadBigInts(true)
    const budgetRow = budget.get()
    assert.equal(budgetRow.lifetime_put_bytes, 9007199254740993n)
    assert.equal(budgetRow.monthly_period, '2026-10')
    assert.equal(budgetRow.monthly_operations, 321n)
    const sequence = db.prepare('SELECT name, seq FROM sqlite_sequence').get()
    assert.equal(sequence.name, 'd1_migrations')
    assert.equal(sequence.seq, 77)
  })
})

test('rejects invalid foreign keys, schema cycles, and tables outside the supported schema', () => {
  assert.throws(
    () =>
      prepareD1RestoreSql(
        schema.replace(
          "'user-1', 'o''hara@example.test'",
          "'missing-user', 'o''hara@example.test'",
        ),
      ),
    /foreign-key violation/,
  )

  const cycle = schema.replace(
    'raw BLOB);',
    'raw BLOB, FOREIGN KEY (id) REFERENCES profiles(user_id));',
  )
  assert.throws(() => prepareD1RestoreSql(cycle), /foreign-key cycle/)
  assert.throws(
    () => prepareD1RestoreSql(`${schema}\nCREATE TABLE unexpected (id INTEGER);`),
    /unsupported table: unexpected/,
  )
})

test('writes a private new file and refuses to overwrite or replace the source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rca-restore-test-'))
  const input = join(dir, 'source.sql')
  const output = join(dir, 'restore.sql')
  try {
    await writeFile(input, schema, { mode: 0o600 })
    const result = await prepareD1RestoreFile(input, output)
    assert.equal(result.output, output)
    assert.equal((await stat(output)).mode & 0o777, 0o600)
    assert.doesNotMatch(
      await readFile(output, 'utf8'),
      /PRAGMA foreign_keys|BEGIN TRANSACTION|COMMIT;/,
    )

    await assert.rejects(prepareD1RestoreFile(input, output), /already exists/)
    assert.match(await readFile(output, 'utf8'), /CREATE TABLE users/)
    await assert.rejects(prepareD1RestoreFile(input, input), /must not overwrite/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('enforces the 64 MiB input cap before parsing and before reading file contents', async () => {
  assert.throws(
    () => prepareD1RestoreSql(' '.repeat(MAX_D1_EXPORT_BYTES + 1)),
    /64 MiB preparation limit/,
  )

  const dir = await mkdtemp(join(tmpdir(), 'rca-restore-cap-test-'))
  const input = join(dir, 'oversized.sql')
  const output = join(dir, 'restore.sql')
  try {
    await writeFile(input, '')
    await truncate(input, MAX_D1_EXPORT_BYTES + 1)
    await assert.rejects(prepareD1RestoreFile(input, output), /64 MiB preparation limit/)
    await assert.rejects(access(output), { code: 'ENOENT' })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('accepts exports from the current schema, orders its new tables after their parents, and keeps old exports restorable', () => {
  const current = `
  PRAGMA defer_foreign_keys=TRUE;
  CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT NOT NULL);
  CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, picture_url TEXT, created_at INTEGER NOT NULL, activity_count INTEGER NOT NULL DEFAULT 0, deleting_at INTEGER);
  CREATE TABLE activities (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, digest TEXT);
  CREATE TABLE oauth_accounts (provider TEXT NOT NULL, provider_user_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(provider, provider_user_id));
  CREATE TABLE profiles (user_id TEXT PRIMARY KEY REFERENCES users(id), units TEXT);
  CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id));
  CREATE TABLE r2_storage_budget (id INTEGER PRIMARY KEY, lifetime_put_bytes INTEGER NOT NULL, monthly_period TEXT NOT NULL, monthly_operations INTEGER NOT NULL, monthly_put_bytes INTEGER NOT NULL DEFAULT 0, orphan_sweep_cursor TEXT);
  CREATE TABLE daily_budget (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, day TEXT NOT NULL, action TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day, action));
  CREATE TABLE upload_slots (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, slot_id TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY (user_id, slot_id));
  CREATE TABLE pending_account_deletions (user_id TEXT PRIMARY KEY NOT NULL, requested_at INTEGER NOT NULL, sweep_pending INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE athlete_measurements (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, sport TEXT NOT NULL DEFAULT '', from_date TEXT NOT NULL, value REAL NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, kind, sport, from_date));
  INSERT INTO users VALUES ('user-1', 'a@example.test', 'Alex', NULL, 1, 0, NULL);
  INSERT INTO athlete_measurements VALUES ('user-1', 'massKg', '', '2026-01-01', 80, 0);
  INSERT INTO daily_budget VALUES ('user-1', '2026-10-22', 'read', 3);
  INSERT INTO upload_slots VALUES ('user-1', 'slot', 5);
  INSERT INTO pending_account_deletions VALUES ('user-1', 1, 0);
  INSERT INTO d1_migrations(name, applied_at) VALUES ('0003', '2026-10-22');
  `
  const prepared = prepareD1RestoreSql(current)
  assert.ok(
    prepared.indexOf('INSERT INTO "users"') < prepared.indexOf('INSERT INTO "daily_budget"'),
  )
  inspect(prepared, (db) => {
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
    assert.equal(db.prepare('SELECT used FROM daily_budget').get().used, 3)
    assert.equal(db.prepare('SELECT value FROM athlete_measurements').get().value, 80)
  })
  // Exports from before the budget and deletion tables existed still restore.
  assert.doesNotThrow(() => prepareD1RestoreSql(schema))
})

/** The three triggers that migration 0008 puts on activities, as the export would carry them. */
const fileBytesTriggers = (
  await readFile(new URL('../migrations/0008_file_bytes.sql', import.meta.url), 'utf8')
)
  .split('--> statement-breakpoint')
  .map((statement) => statement.trim())
  .filter((statement) => statement.startsWith('CREATE TRIGGER'))

/** An export whose users carry file_bytes and whose activities carry file_size. */
function fileBytesExport({ triggersBeforeRows }) {
  const tables = `
  PRAGMA defer_foreign_keys=TRUE;
  CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT NOT NULL);
  CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, picture_url TEXT, created_at INTEGER NOT NULL, file_bytes integer DEFAULT 0 NOT NULL);
  CREATE TABLE activities (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, file_size integer);
  CREATE TABLE oauth_accounts (provider TEXT NOT NULL, provider_user_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(provider, provider_user_id));
  CREATE TABLE profiles (user_id TEXT PRIMARY KEY REFERENCES users(id), units TEXT);
  CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id));
  CREATE TABLE r2_storage_budget (id INTEGER PRIMARY KEY, lifetime_put_bytes INTEGER NOT NULL, monthly_period TEXT NOT NULL, monthly_operations INTEGER NOT NULL);
  `
  const rows = `
  INSERT INTO users VALUES ('user-1', 'a@example.test', 'Alex', NULL, 1, 300);
  INSERT INTO users VALUES ('user-2', 'b@example.test', 'Blair', NULL, 1, 0);
  INSERT INTO activities VALUES ('act-1', 'user-1', 100);
  INSERT INTO activities VALUES ('act-2', 'user-1', 200);
  INSERT INTO activities VALUES ('act-3', 'user-2', NULL);
  INSERT INTO d1_migrations(name, applied_at) VALUES ('0008_file_bytes', '2026-10-26');
  `
  const triggers = fileBytesTriggers.join('\n')
  return triggersBeforeRows ? tables + triggers + rows : tables + rows + triggers
}

for (const [name, triggersBeforeRows] of [
  ['after the rows, as a dump writes them', false],
  ['before the rows, with each user loaded ahead of its activities', true],
]) {
  test(`restores each user's file_bytes as it was when the triggers come ${name}`, () => {
    assert.equal(fileBytesTriggers.length, 3)
    const prepared = prepareD1RestoreSql(fileBytesExport({ triggersBeforeRows }))
    assert.ok(prepared.indexOf('CREATE TRIGGER') > prepared.indexOf('INSERT INTO "activities"'))

    inspect(prepared, (db) => {
      const counters = db.prepare('SELECT id, file_bytes FROM users ORDER BY id').all()
      assert.deepEqual(
        counters.map((row) => [row.id, row.file_bytes]),
        [
          ['user-1', 300],
          ['user-2', 0],
        ],
      )
      assert.equal(
        db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'").get().n,
        3,
      )
      // The restored triggers are live: a later change to file_size moves the counter.
      db.exec("UPDATE activities SET file_size = 150 WHERE id = 'act-1'")
      assert.equal(db.prepare("SELECT file_bytes AS n FROM users WHERE id = 'user-1'").get().n, 350)
    })
  })
}

test('keeps row text that looks like SQL, and splits only at real statement ends', () => {
  const text =
    "it's; -- not a comment /* nor this */ CREATE TRIGGER fake AFTER INSERT ON users BEGIN SELECT 1; END;"
  const dump = fileBytesExport({ triggersBeforeRows: true })
    .replace("'Alex'", `'${text.replaceAll("'", "''")}'`)
    .replace('PRAGMA defer_foreign_keys=TRUE;', '-- one; two\nPRAGMA defer_foreign_keys=TRUE;')
  inspect(prepareD1RestoreSql(dump), (db) => {
    assert.equal(db.prepare("SELECT name FROM users WHERE id = 'user-1'").get().name, text)
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'").get().n,
      3,
    )
    assert.equal(db.prepare("SELECT file_bytes AS n FROM users WHERE id = 'user-1'").get().n, 300)
  })
})
