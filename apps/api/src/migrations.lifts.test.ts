import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

/**
 * Migration 0012 (lift_sets, users.lift_count and lift_revision) is additive, and the cap lives in a
 * named check on users, so it holds in SQL whichever statement moves the count.
 */
const MIGRATIONS = new URL('../migrations/', import.meta.url)

function migrated(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', MIGRATIONS), 'utf8')) as {
    entries: { tag: string }[]
  }
  for (const { tag } of journal.entries) {
    db.exec(
      readFileSync(new URL(`${tag}.sql`, MIGRATIONS), 'utf8').replaceAll(
        '--> statement-breakpoint',
        '',
      ),
    )
    if (tag === '0011_account_tombstones') {
      db.exec(
        "INSERT INTO users (id, email, name, created_at) VALUES ('u1', 'a@example.test', 'A', 1)",
      )
    }
  }
  return db
}

const SET = `INSERT INTO lift_sets (user_id, date, exercise, equipment, set_order, reps, load_kg, updated_at)
  VALUES ('u1', '2026-03-02', 'back-squat', 'barbell', 1, 5, 100, 1)`

describe('migration 0012', () => {
  it('gives an existing user zero sets and revision zero', () => {
    const row = migrated().prepare('SELECT lift_count, lift_revision FROM users').get()
    expect(row).toEqual({ lift_count: 0, lift_revision: 0 })
  })

  it('fails a count past the cap by its name, and takes the count at the cap', () => {
    const db = migrated()
    db.exec('UPDATE users SET lift_count = 60000')
    expect(() => db.exec('UPDATE users SET lift_count = 60001')).toThrow(/users_lift_count_cap/)
    expect(() => db.exec('UPDATE users SET lift_count = -1')).toThrow(/users_lift_count_cap/)
  })

  it('refuses a second row for one key, a bad equipment and a time without its precision', () => {
    const db = migrated()
    db.exec(SET)
    expect(() => db.exec(SET)).toThrow(/UNIQUE|PRIMARY/)
    expect(() =>
      db.exec(SET.replace("'barbell', 1", "'cable', 1").replace("'cable'", "'spring'")),
    ).toThrow(/lift_sets_equipment_check/)
    expect(() =>
      db.exec(`INSERT INTO lift_sets (user_id, date, exercise, equipment, set_order, reps, load_kg, time, updated_at)
        VALUES ('u1', '2026-03-02', 'row', 'cable', 1, 8, 40, '07:30', 1)`),
    ).toThrow(/lift_sets_time_pair_check/)
  })

  it('removes an account sets with the account', () => {
    const db = migrated()
    db.exec(SET)
    db.exec("DELETE FROM users WHERE id = 'u1'")
    expect(db.prepare('SELECT COUNT(*) AS n FROM lift_sets').get()).toEqual({ n: 0 })
  })
})
