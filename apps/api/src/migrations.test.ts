import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/d1'
import { migrate } from 'drizzle-orm/d1/migrator'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { schema } from './db/schema.ts'

const MIGRATIONS = new URL('../migrations/', import.meta.url)
const PREVIOUS_SCHEMA_LAST = '0003_budgets_deletion_indexes'

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
  it('applies 0005 when continuing from a database whose latest migration is 0004', async () => {
    const sourceJournal = JSON.parse(
      readFileSync(new URL('meta/_journal.json', MIGRATIONS), 'utf8'),
    ) as { entries: { tag: string }[] }
    const temporary = await mkdtemp(join(tmpdir(), 'rca-migrations-'))
    await mkdir(join(temporary, 'meta'))
    const initialEntries = sourceJournal.entries.slice(0, 5)
    const writeJournal = (entries: { tag: string }[]) =>
      writeFile(
        join(temporary, 'meta/_journal.json'),
        JSON.stringify({ version: '7', dialect: 'sqlite', entries }),
      )
    for (const { tag } of sourceJournal.entries) {
      await writeFile(
        join(temporary, `${tag}.sql`),
        await readFile(new URL(`${tag}.sql`, MIGRATIONS)),
      )
    }
    const platform = await getPlatformProxy<{ DB: D1Database }>({
      configPath: new URL('../wrangler.local.toml', import.meta.url).pathname,
      persist: false,
      remoteBindings: false,
    })
    try {
      const db = drizzle(platform.env.DB)
      await writeJournal(initialEntries)
      await migrate(db, { migrationsFolder: temporary })

      // The second invocation is the rollout recovery path: 0004 is recorded as latest, and
      // migration 0005 must still be considered newer and applied.
      await writeJournal(sourceJournal.entries)
      await migrate(db, { migrationsFolder: temporary })

      const column = await platform.env.DB.prepare('PRAGMA table_info(activities)').all<{
        name: string
      }>()
      expect(column.results.map((row) => row.name)).toContain('file_reservation_token')
    } finally {
      await platform.dispose()
      await rm(temporary, { recursive: true, force: true })
    }
  })

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
        UPDATE users SET activity_count = 3 WHERE id = 'u1';
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
      // The digest counter starts at the bytes each user's existing rows already hold.
      expect(db.prepare('SELECT id, digest_bytes FROM users ORDER BY id').all()).toEqual([
        { id: 'u1', digest_bytes: 21 },
        { id: 'u2', digest_bytes: 0 },
      ])
      // The stored-file counter starts at the bytes each user's existing rows already hold.
      expect(db.prepare('SELECT id, file_bytes FROM users ORDER BY id').all()).toEqual([
        { id: 'u1', file_bytes: 300 },
        { id: 'u2', file_bytes: 0 },
      ])
      expect(db.prepare('SELECT list_cursor FROM users').all()).toEqual([
        { list_cursor: null },
        { list_cursor: null },
      ])
      expect(db.prepare('SELECT d1_size_bytes FROM r2_storage_budget').get()).toEqual({
        d1_size_bytes: 0,
      })
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

  it('adds year of birth and sex as nullable profile columns that reject any other sex', () => {
    const tags = journalTags()
    const cut = tags.indexOf('0005_upload_reservation_token')
    expect(cut).toBeGreaterThan(0)
    const db = new DatabaseSync(':memory:')
    try {
      db.exec('PRAGMA foreign_keys = ON')
      for (const tag of tags.slice(0, cut + 1)) applyMigration(db, tag)
      db.exec(`
        INSERT INTO users (id, email, name, picture_url, created_at)
          VALUES ('u1', 'a@example.test', 'A', NULL, 1);
        INSERT INTO profiles (user_id, mass_kg, bike_mass_kg, units, keep_files, updated_at)
          VALUES ('u1', 75, 9, 'imperial', 0, 1);
      `)
      for (const tag of tags.slice(cut + 1)) applyMigration(db, tag)

      expect(db.prepare('SELECT birth_year, sex FROM profiles').get()).toEqual({
        birth_year: null,
        sex: null,
      })
      db.exec("UPDATE profiles SET birth_year = 1980, sex = 'female' WHERE user_id = 'u1'")
      db.exec("UPDATE profiles SET sex = NULL WHERE user_id = 'u1'")
      expect(() => db.exec("UPDATE profiles SET sex = 'other' WHERE user_id = 'u1'")).toThrow(
        /CHECK constraint/,
      )
      expect(() => db.exec("UPDATE profiles SET sex = 'Male' WHERE user_id = 'u1'")).toThrow(
        /CHECK constraint/,
      )
    } finally {
      db.close()
    }
  })

  it('lets the body mass be null, and keeps every profile row through the rebuild', () => {
    const tags = journalTags()
    const cut = tags.indexOf('0006_profile_age_sex')
    expect(cut).toBeGreaterThan(0)
    const db = new DatabaseSync(':memory:')
    try {
      db.exec('PRAGMA foreign_keys = ON')
      for (const tag of tags.slice(0, cut + 1)) applyMigration(db, tag)
      db.exec(`
        INSERT INTO users (id, email, name, picture_url, created_at)
          VALUES ('u1', 'a@example.test', 'A', NULL, 1), ('u2', 'b@example.test', 'B', NULL, 1);
        INSERT INTO profiles (user_id, mass_kg, bike_mass_kg, units, keep_files, updated_at,
          birth_year, sex) VALUES
          ('u1', 75, 9, 'imperial', 1, 1, 1980, 'female'),
          ('u2', 82.5, 11, 'metric', 0, 2, NULL, NULL);
      `)
      const before = db.prepare('SELECT * FROM profiles ORDER BY user_id').all()

      for (const tag of tags.slice(cut + 1)) applyMigration(db, tag)

      // The stored masses, including the old 75 kg default, are kept as they were.
      expect(db.prepare('SELECT * FROM profiles ORDER BY user_id').all()).toEqual(before)
      db.exec(`
        INSERT INTO users (id, email, name, picture_url, created_at)
          VALUES ('u3', 'c@example.test', 'C', NULL, 1);
        INSERT INTO profiles (user_id, mass_kg, bike_mass_kg, units, keep_files, updated_at)
          VALUES ('u3', NULL, 9, 'metric', 0, 3);
      `)
      expect(db.prepare("SELECT mass_kg FROM profiles WHERE user_id = 'u3'").get()).toEqual({
        mass_kg: null,
      })
      db.exec("UPDATE profiles SET mass_kg = NULL WHERE user_id = 'u1'")
      expect(() => db.exec("UPDATE profiles SET sex = 'other' WHERE user_id = 'u1'")).toThrow(
        /CHECK constraint/,
      )
      expect(() => db.exec("UPDATE profiles SET bike_mass_kg = NULL WHERE user_id = 'u1'")).toThrow(
        /NOT NULL/,
      )
      db.exec("DELETE FROM users WHERE id = 'u1'")
      expect(db.prepare('SELECT user_id FROM profiles ORDER BY user_id').all()).toEqual([
        { user_id: 'u2' },
        { user_id: 'u3' },
      ])
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
    } finally {
      db.close()
    }
  })

  it("counts each user's stored file bytes, backfilled, and keeps the count exact for any writer", () => {
    const tags = journalTags()
    const cut = tags.indexOf('0007_profile_mass_nullable')
    expect(cut).toBeGreaterThan(0)
    const db = new DatabaseSync(':memory:')
    const counters = () =>
      db
        .prepare(
          `SELECT id, file_bytes AS counter,
             (SELECT coalesce(sum(file_size), 0) FROM activities WHERE user_id = users.id) AS actual
           FROM users ORDER BY id`,
        )
        .all()
    const agree = () =>
      counters().map((row) => ({ id: row.id, counter: row.actual, actual: row.actual }))
    try {
      db.exec('PRAGMA foreign_keys = ON')
      for (const tag of tags.slice(0, cut + 1)) applyMigration(db, tag)
      db.exec(`
        INSERT INTO users (id, email, name, picture_url, created_at)
          VALUES ('u1', 'a@example.test', 'A', NULL, 1), ('u2', 'b@example.test', 'B', NULL, 1),
                 ('u3', 'c@example.test', 'C', NULL, 1);
        INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
          digest_json, file_name, file_hash, file_key, file_size, created_at) VALUES
          ('a1', 'u1', 'ride-1', 'ride', 1000, 'One', 1, '{}', 'one.fit', 'h1', 'users/u1/a1', 100, 1),
          ('a2', 'u1', 'ride-2', 'ride', 2000, 'Two', 1, '{}', 'two.fit', 'h2', NULL, NULL, 2),
          ('a3', 'u1', 'run-3', 'run', 3000, 'Three', 1, '{}', 'three.fit', 'h3', NULL, 200, 3),
          ('b1', 'u2', 'ride-1', 'ride', 1000, 'One', 1, '{}', 'one.fit', 'h4', 'users/u2/b1', 50, 1);
      `)

      for (const tag of tags.slice(cut + 1)) applyMigration(db, tag)

      // A reservation (a size with no key yet) counts, as it does in the sum the quota used to take.
      expect(counters()).toEqual([
        { id: 'u1', counter: 300, actual: 300 },
        { id: 'u2', counter: 50, actual: 50 },
        { id: 'u3', counter: 0, actual: 0 },
      ])

      // The Worker that is live during a release writes file_size without naming file_bytes.
      const insertC1 = (size: string) =>
        db.exec(`INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name,
          digest_version, digest_json, file_name, file_hash, file_size, created_at)
          VALUES ('c1', 'u3', 'ride-1', 'ride', 1, 'C', 1, '{}', 'c.fit', 'h5', ${size}, 1)`)
      insertC1('70')
      expect(counters()).toEqual(agree())
      expect(db.prepare("SELECT file_bytes FROM users WHERE id = 'u3'").get()).toEqual({
        file_bytes: 70,
      })
      for (const size of ['90', 'NULL', '40', '40']) {
        db.exec(`UPDATE activities SET file_size = ${size} WHERE id = 'c1'`)
        expect(counters()).toEqual(agree())
      }
      // A write that leaves file_size alone does not move the counter.
      db.exec("UPDATE activities SET name = 'renamed', file_key = 'k' WHERE id = 'c1'")
      expect(db.prepare("SELECT file_bytes FROM users WHERE id = 'u3'").get()).toEqual({
        file_bytes: 40,
      })
      db.exec("DELETE FROM activities WHERE id = 'a1'")
      db.exec("DELETE FROM activities WHERE id = 'a2'")
      expect(counters()).toEqual(agree())
      expect(db.prepare("SELECT file_bytes FROM users WHERE id = 'u1'").get()).toEqual({
        file_bytes: 200,
      })

      // Deleting an account cascades to its activities, and the counter goes with the row.
      db.exec("DELETE FROM users WHERE id = 'u2'")
      expect(counters()).toEqual(agree())
      expect(db.prepare('SELECT id FROM users ORDER BY id').all()).toEqual([
        { id: 'u1' },
        { id: 'u3' },
      ])
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

describe('schema', () => {
  it('declares every column the migrated database has, with the same type, nullability and key', () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.exec('PRAGMA foreign_keys = ON')
      for (const tag of journalTags()) applyMigration(db, tag)
      for (const table of Object.values(schema)) {
        const config = getTableConfig(table)
        // A composite key is declared on the table, so a member column is not `primary` on its own.
        const keyed = new Set(
          config.primaryKeys.flatMap((key) => key.columns.map((column) => column.name)),
        )
        const declared = config.columns.map((column) => ({
          name: column.name,
          type: column.getSQLType().toLowerCase(),
          notNull: column.notNull,
          primaryKey: column.primary || keyed.has(column.name),
        }))
        const migrated = (
          db.prepare(`PRAGMA table_info(\`${config.name}\`)`).all() as {
            name: string
            type: string
            notnull: number
            pk: number
          }[]
        ).map((column) => ({
          name: column.name,
          type: column.type.toLowerCase(),
          notNull: column.notnull === 1,
          primaryKey: column.pk > 0,
        }))
        const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)
        expect(declared.sort(byName), config.name).toEqual(migrated.sort(byName))
      }
    } finally {
      db.close()
    }
  })
})
