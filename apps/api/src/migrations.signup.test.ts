import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

/**
 * Migration 0010 (identity_budget, the listing index, one identity per user and provider) must be
 * additive plus one clearing UPDATE (users.list_cursor set to NULL): the Worker that is live before the release (rollback floor 3e17b541) keeps working
 * against the migrated database. The statements below are the ones that Worker issues.
 */
const MIGRATIONS = new URL('../migrations/', import.meta.url)
const LAST_BEFORE = '0009_athlete_measurements'
const THIS = '0010_signup_safety_list_index'
const DUPLICATE_CHECK =
  'SELECT user_id, provider, COUNT(*) AS n FROM oauth_accounts GROUP BY user_id, provider HAVING COUNT(*) > 1'

function journalTags(): string[] {
  const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', MIGRATIONS), 'utf8')) as {
    entries: { tag: string }[]
  }
  return journal.entries.map((entry) => entry.tag)
}

function apply(db: DatabaseSync, tag: string): void {
  db.exec(readFileSync(new URL(`${tag}.sql`, MIGRATIONS), 'utf8'))
}

function databaseBefore(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  const tags = journalTags()
  expect(tags).toContain(THIS)
  for (const tag of tags.slice(0, tags.indexOf(LAST_BEFORE) + 1)) apply(db, tag)
  db.exec(`
    INSERT INTO users (id, email, name, picture_url, created_at)
      VALUES ('u1', 'a@example.test', 'A', NULL, 1), ('u2', 'b@example.test', 'B', NULL, 1);
    INSERT INTO oauth_accounts VALUES ('google', 'g-1', 'u1'), ('google', 'g-2', 'u2');
    INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('s1', 'u1', 9999999999999, 1);
    INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
      digest_json, file_name, file_hash, created_at) VALUES
      ('a1', 'u1', 'run-1', 'run', 1000, 'One', 1, '{"x":1}', 'one.fit', 'h1', 5),
      ('a2', 'u1', 'run-2', 'run', 2000, 'Two', 1, '{"x":2}', 'two.fit', 'h2', 5);
    INSERT INTO daily_budget (user_id, day, action, used) VALUES ('u1', '2026-01-15', 'read', 3);
  `)
  return db
}

describe('migration 0010', () => {
  it('clears the legacy list cursor slot, which the new Worker no longer uses, and nothing else', () => {
    const db = databaseBefore()
    try {
      db.exec("UPDATE users SET list_cursor = 'stale-cursor' WHERE id = 'u1'")
      const others = () =>
        db
          .prepare('SELECT id, email, name, activity_count, digest_bytes FROM users ORDER BY id')
          .all()
      const before = others()
      apply(db, THIS)
      expect(db.prepare('SELECT id, list_cursor FROM users ORDER BY id').all()).toEqual([
        { id: 'u1', list_cursor: null },
        { id: 'u2', list_cursor: null },
      ])
      expect(others()).toEqual(before)
      // The previous Worker's "spend" statement finds nothing to spend: without the clearing UPDATE
      // the stale value would still match and this would change one row.
      expect(
        db
          .prepare('UPDATE users SET list_cursor = NULL WHERE id = ? AND list_cursor = ?')
          .run('u1', 'stale-cursor').changes,
      ).toBe(0)
    } finally {
      db.close()
    }
  })

  it('adds only a table and indexes, and changes no other row or column', () => {
    const db = databaseBefore()
    try {
      const columnsBefore = (name: string) =>
        db
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .map((c) => c.name)
      const tables = ['users', 'oauth_accounts', 'sessions', 'activities', 'daily_budget']
      const before = Object.fromEntries(tables.map((t) => [t, columnsBefore(t)]))
      const rowsBefore = Object.fromEntries(
        tables.map((t) => [t, db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]),
      )

      apply(db, THIS)

      for (const table of tables) {
        expect(columnsBefore(table), table).toEqual(before[table])
        expect(db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(), table).toEqual(
          rowsBefore[table],
        )
      }
      const names = db
        .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'index')")
        .all()
        .map((row) => row.name)
      for (const added of [
        'identity_budget',
        'identity_budget_day_idx',
        'activities_user_created_id_idx',
        'oauth_accounts_user_provider_unique',
      ]) {
        expect(names).toContain(added)
      }
      expect(db.prepare('SELECT COUNT(*) AS n FROM identity_budget').get()).toEqual({ n: 0 })
      expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    } finally {
      db.close()
    }
  })

  it('leaves every statement the previous Worker issues working', () => {
    const db = databaseBefore()
    try {
      apply(db, THIS)
      // Sign-in: the conditional link insert, a new user, a session.
      db.exec(`INSERT INTO users (id, email, name, picture_url, created_at)
        VALUES ('u3', 'c@example.test', 'C', NULL, 2)`)
      const link = (sub: string, user: string) =>
        db
          .prepare(
            `INSERT INTO oauth_accounts (provider, provider_user_id, user_id)
             SELECT 'google', ?, ? WHERE NOT EXISTS (
               SELECT 1 FROM oauth_accounts WHERE provider = 'google' AND user_id = ?)
             ON CONFLICT(provider, provider_user_id) DO NOTHING`,
          )
          .run(sub, user, user)
      expect(link('g-3', 'u3').changes).toBe(1)
      // A second identity for the same user is skipped by the statement, never an error.
      expect(link('g-4', 'u3').changes).toBe(0)
      db.exec(
        `INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('s2', 'u3', 9, 2)`,
      )
      // Listing: the single cursor slot and the old page queries.
      db.prepare('UPDATE users SET list_cursor = ? WHERE id = ?').run('cursor', 'u1')
      expect(
        db
          .prepare('UPDATE users SET list_cursor = NULL WHERE id = ? AND list_cursor = ?')
          .run('u1', 'cursor').changes,
      ).toBe(1)
      expect(
        db
          .prepare(
            `SELECT id FROM activities WHERE user_id = ? AND (created_at < ? OR (created_at = ? AND id < ?))
             ORDER BY created_at DESC, id DESC LIMIT 3`,
          )
          .all('u1', 5, 5, 'a2'),
      ).toEqual([{ id: 'a1' }])
      expect(
        db
          .prepare('SELECT id FROM activities WHERE user_id = ? AND id IN (?, ?)')
          .all('u1', 'a1', 'a2'),
      ).toHaveLength(2)
      // Deleting an account cascades as before and does not touch identity_budget.
      db.exec("INSERT INTO identity_budget VALUES ('k', '2026-01-15', 'read', 1)")
      db.exec("DELETE FROM users WHERE id = 'u1'")
      expect(db.prepare("SELECT COUNT(*) AS n FROM activities WHERE user_id = 'u1'").get()).toEqual(
        { n: 0 },
      )
      expect(db.prepare('SELECT COUNT(*) AS n FROM identity_budget').get()).toEqual({ n: 1 })
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      db.close()
    }
  })

  it('makes one Google identity per user a rule of the database', () => {
    const db = databaseBefore()
    try {
      apply(db, THIS)
      expect(() =>
        db.exec("INSERT INTO oauth_accounts VALUES ('google', 'g-other', 'u1')"),
      ).toThrow(/UNIQUE/)
      db.exec("INSERT INTO oauth_accounts VALUES ('github', 'x-1', 'u1')")
    } finally {
      db.close()
    }
  })

  it('fails on a database with two identities for one user, which the pre-flight query finds first', () => {
    const db = databaseBefore()
    try {
      db.exec("INSERT INTO oauth_accounts VALUES ('google', 'g-extra', 'u1')")
      expect(db.prepare(DUPLICATE_CHECK).all()).toEqual([
        { user_id: 'u1', provider: 'google', n: 2 },
      ])
      expect(() => apply(db, THIS)).toThrow(/UNIQUE/)
    } finally {
      db.close()
    }
  })

  it('finds nothing to report on a clean database', () => {
    const db = databaseBefore()
    try {
      expect(db.prepare(DUPLICATE_CHECK).all()).toEqual([])
    } finally {
      db.close()
    }
  })

  it('documents the pre-flight query in the production notes', () => {
    const notes = readFileSync(new URL('../../../docs/PRODUCTION.md', import.meta.url), 'utf8')
    expect(notes).toContain(DUPLICATE_CHECK)
  })
})
