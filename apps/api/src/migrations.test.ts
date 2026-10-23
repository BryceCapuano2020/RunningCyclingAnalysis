import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

const MIGRATIONS = new URL('../migrations/', import.meta.url)
const PREVIOUS_SCHEMA_LAST = '0002_r2_storage_budget'

function journalTags(): string[] {
  const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', MIGRATIONS), 'utf8')) as {
    entries: { tag: string }[]
  }
  return journal.entries.map((entry) => entry.tag)
}

function applyMigration(db: DatabaseSync, tag: string): void {
  db.exec(readFileSync(new URL(`${tag}.sql`, MIGRATIONS), 'utf8'))
}

describe('migrations', () => {
  it('upgrades a database seeded under the previous schema without losing or changing data', () => {
    const tags = journalTags()
    const cut = tags.indexOf(PREVIOUS_SCHEMA_LAST)
    expect(cut).toBeGreaterThan(0)
    const db = new DatabaseSync(':memory:')
    try {
      db.exec('PRAGMA foreign_keys = ON')
      for (const tag of tags.slice(0, cut + 1)) applyMigration(db, tag)

      db.exec(`
        INSERT INTO users (id, email, name, picture_url, created_at)
          VALUES ('u1', 'a@example.test', 'A', NULL, 1), ('u2', 'b@example.test', 'B', NULL, 1);
        INSERT INTO oauth_accounts VALUES ('google', 'g-1', 'u1');
        INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('s1', 'u1', 9999999999999, 1);
        INSERT INTO profiles VALUES ('u1', 75, 9, 'imperial', 1, 1);
        INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
          digest_json, file_name, file_hash, file_key, file_size, created_at) VALUES
          ('a1', 'u1', 'ride-1', 'ride', 1000, 'One', 1, '{"x":1}', 'one.fit', 'h1', 'users/u1/a1', 100, 1),
          ('a2', 'u1', 'ride-2', 'ride', 2000, 'Two', 1, '{"x":2}', 'two.fit', 'h2', NULL, NULL, 2),
          ('a3', 'u1', 'run-3', 'run', 3000, 'Three', 1, '{"x":3}', 'three.fit', 'h3', 'users/u1/a3', 200, 3);
        UPDATE r2_storage_budget SET lifetime_put_bytes = 300, monthly_period = '2026-10',
          monthly_operations = 5 WHERE id = 1;
      `)
      const before = db
        .prepare('SELECT id, digest_json, file_size FROM activities ORDER BY id')
        .all()

      for (const tag of tags.slice(cut + 1)) applyMigration(db, tag)

      expect(
        db.prepare('SELECT id, digest_json, file_size FROM activities ORDER BY id').all(),
      ).toEqual(before)
      expect(db.prepare('SELECT id, activity_count FROM users ORDER BY id').all()).toEqual([
        { id: 'u1', activity_count: 3 },
        { id: 'u2', activity_count: 0 },
      ])
      expect(db.prepare('SELECT deleting_at FROM users').all()).toEqual([
        { deleting_at: null },
        { deleting_at: null },
      ])
      expect(
        db
          .prepare(
            'SELECT lifetime_put_bytes, monthly_put_bytes, monthly_period, monthly_operations FROM r2_storage_budget',
          )
          .get(),
      ).toEqual({
        lifetime_put_bytes: 300,
        monthly_put_bytes: 0,
        monthly_period: '2026-10',
        monthly_operations: 5,
      })
      expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 1 })
      expect(
        db
          .prepare(
            `SELECT health_probe_day, health_probe_day_count, health_probe_month,
                    health_probe_month_count FROM r2_storage_budget`,
          )
          .get(),
      ).toEqual({
        health_probe_day: '',
        health_probe_day_count: 0,
        health_probe_month: '',
        health_probe_month_count: 0,
      })
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    } finally {
      db.close()
    }
  })

  it('creates the indexes and tables that the new code relies on', () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.exec('PRAGMA foreign_keys = ON')
      for (const tag of journalTags()) applyMigration(db, tag)
      const names = db
        .prepare("SELECT name FROM sqlite_master WHERE type IN ('index', 'table') ORDER BY name")
        .all()
        .map((row) => row.name)
      for (const expected of [
        'daily_budget',
        'upload_slots',
        'pending_account_deletions',
        'oauth_accounts_user_idx',
        'sessions_user_idx',
        'upload_slots_expires_idx',
      ]) {
        expect(names).toContain(expected)
      }
    } finally {
      db.close()
    }
  })
})
