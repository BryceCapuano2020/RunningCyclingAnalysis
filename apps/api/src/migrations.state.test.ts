import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

/** Migration 0014: the account's one change counter, raised by triggers, and the state job's table. */
const MIGRATIONS = new URL('../migrations/', import.meta.url)

function migrated(until = '0014_server_state'): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', MIGRATIONS), 'utf8')) as {
    entries: { tag: string }[]
  }
  for (const { tag } of journal.entries) {
    if (tag === until) {
      db.exec(
        "INSERT INTO users (id, email, name, created_at) VALUES ('old', 'o@example.test', 'O', 1)",
      )
    }
    db.exec(
      readFileSync(new URL(`${tag}.sql`, MIGRATIONS), 'utf8').replaceAll(
        '--> statement-breakpoint',
        '',
      ),
    )
    if (tag === until) break
  }
  return db
}

const version = (db: DatabaseSync, id = 'u1') =>
  (db.prepare('SELECT library_version AS v FROM users WHERE id = ?').get(id) as { v: number }).v

function fresh(): DatabaseSync {
  const db = migrated()
  db.exec("INSERT INTO users (id, email, name, created_at) VALUES ('u1', 'a@example.test', 'A', 1)")
  return db
}

const ACTIVITY = (id: string, key: string) =>
  `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version, digest_json, file_name, file_hash, created_at)
   VALUES ('${id}', 'u1', '${key}', 'run', 1, 'n', 1, '{}', 'f', 'h', 1)`

describe('migration 0014', () => {
  it('is in the journal after 0013', () => {
    const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', MIGRATIONS), 'utf8')) as {
      entries: { tag: string }[]
    }
    const tags = journal.entries.map((entry) => entry.tag)
    expect(tags.indexOf('0014_server_state')).toBe(tags.indexOf('0013_account_settings') + 1)
  })

  it('marks an account that existed dirty at 1, and a new one starts at 0', () => {
    const db = migrated()
    expect(version(db, 'old')).toBe(1)
    db.exec(
      "INSERT INTO users (id, email, name, created_at) VALUES ('new', 'n@example.test', 'N', 1)",
    )
    expect(version(db, 'new')).toBe(0)
  })

  it('raises the counter for an activity inserted or deleted, once each', () => {
    const db = fresh()
    db.exec(ACTIVITY('a1', 'run-1'))
    expect(version(db)).toBe(1)
    db.exec(ACTIVITY('a2', 'run-2'))
    expect(version(db)).toBe(2)
    db.exec("DELETE FROM activities WHERE id = 'a1'")
    expect(version(db)).toBe(3)
  })

  it('leaves a digest rewrite to the statements that make it: no trigger counts it in meta.changes', () => {
    const db = fresh()
    db.exec(ACTIVITY('a1', 'run-1'))
    const before = version(db)
    const result = db
      .prepare("UPDATE activities SET digest_json = '{\"a\":1}' WHERE id = 'a1'")
      .run()
    expect(result.changes).toBe(1)
    expect(version(db)).toBe(before)
  })

  it('raises the counter for the profile fields that move results, and not for the others', () => {
    const db = fresh()
    db.exec(
      "INSERT INTO profiles (user_id, mass_kg, bike_mass_kg, units, keep_files, updated_at) VALUES ('u1', 70, 9, 'metric', 0, 1)",
    )
    expect(version(db)).toBe(1)
    db.exec("UPDATE profiles SET units = 'imperial', keep_files = 1, updated_at = 2")
    expect(version(db)).toBe(1)
    db.exec('UPDATE profiles SET mass_kg = 70')
    expect(version(db)).toBe(1)
    for (const change of [
      'mass_kg = 71',
      'bike_mass_kg = 8',
      'birth_year = 1990',
      "sex = 'male'",
    ]) {
      const before = version(db)
      db.exec(`UPDATE profiles SET ${change}`)
      expect(version(db), change).toBe(before + 1)
    }
    db.exec('UPDATE profiles SET birth_year = NULL')
    expect(version(db)).toBe(6)
  })

  it('raises the counter for a dated setting added, changed or removed', () => {
    const db = fresh()
    db.exec(
      "INSERT INTO athlete_measurements (user_id, kind, sport, from_date, value, updated_at) VALUES ('u1', 'massKg', '', '2026-01-01', 70, 1)",
    )
    expect(version(db)).toBe(1)
    db.exec('UPDATE athlete_measurements SET value = 70, updated_at = 2')
    expect(version(db)).toBe(1)
    db.exec('UPDATE athlete_measurements SET value = 71')
    expect(version(db)).toBe(2)
    db.exec('DELETE FROM athlete_measurements')
    expect(version(db)).toBe(3)
  })

  it('raises the counter for account settings that change, the zone included', () => {
    const db = fresh()
    db.exec(
      "INSERT INTO athlete_settings (user_id, keep_power, updated_at) VALUES ('u1', '[\"a\"]', 1)",
    )
    expect(version(db)).toBe(1)
    db.exec('UPDATE athlete_settings SET updated_at = 2')
    expect(version(db)).toBe(1)
    for (const change of [
      "keep_power = '[]'",
      "counted_runs = '[]'",
      "period = '42'",
      "zone = 'UTC'",
    ]) {
      const before = version(db)
      db.exec(`UPDATE athlete_settings SET ${change}`)
      expect(version(db), change).toBe(before + 1)
    }
  })

  it('holds one job row an account, which goes with the account, with every column defaulted', () => {
    const db = fresh()
    db.exec("INSERT INTO state_jobs (user_id) VALUES ('u1')")
    expect(db.prepare('SELECT * FROM state_jobs').get()).toEqual({
      user_id: 'u1',
      computed_version: 0,
      computed_at: 0,
      snapshot_hash: null,
      snapshot_version: 0,
    })
    expect(() => db.exec("INSERT INTO state_jobs (user_id) VALUES ('u1')")).toThrow()
    expect(() => db.exec("INSERT INTO state_jobs (user_id) VALUES ('nobody')")).toThrow()
    db.exec(ACTIVITY('a1', 'run-1'))
    db.exec("DELETE FROM users WHERE id = 'u1'")
    expect(db.prepare('SELECT COUNT(*) AS n FROM state_jobs').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM activities').get()).toEqual({ n: 0 })
  })
})
