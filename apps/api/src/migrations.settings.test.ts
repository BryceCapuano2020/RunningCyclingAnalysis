import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

/** Migration 0013 (athlete_settings) is one new table: additive, nullable columns, cascading with the user. */
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
    if (tag === '0012_lift_sets') {
      db.exec(
        "INSERT INTO users (id, email, name, created_at) VALUES ('u1', 'a@example.test', 'A', 1)",
      )
    }
  }
  return db
}

describe('migration 0013', () => {
  it('is in the journal, and 0014 is the next one', () => {
    const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', MIGRATIONS), 'utf8')) as {
      entries: { tag: string }[]
    }
    const tags = journal.entries.map((entry) => entry.tag)
    expect(tags.at(13)).toBe('0013_account_settings')
    expect(tags.at(14)).toBe('0014_server_state')
  })

  it('leaves an existing user with no row, and a new row with every choice never set', () => {
    const db = migrated()
    expect(db.prepare('SELECT COUNT(*) AS n FROM athlete_settings').get()).toEqual({ n: 0 })
    db.exec("INSERT INTO athlete_settings (user_id, updated_at) VALUES ('u1', 1)")
    expect(
      db.prepare('SELECT keep_power, counted_runs, period FROM athlete_settings').get(),
    ).toEqual({
      keep_power: null,
      counted_runs: null,
      period: null,
    })
  })

  it('allows one row a user, and drops it with the user', () => {
    const db = migrated()
    db.exec("INSERT INTO athlete_settings (user_id, updated_at) VALUES ('u1', 1)")
    expect(() =>
      db.exec("INSERT INTO athlete_settings (user_id, updated_at) VALUES ('u1', 2)"),
    ).toThrow()
    expect(() =>
      db.exec("INSERT INTO athlete_settings (user_id, updated_at) VALUES ('nobody', 2)"),
    ).toThrow()
    db.exec("DELETE FROM users WHERE id = 'u1'")
    expect(db.prepare('SELECT COUNT(*) AS n FROM athlete_settings').get()).toEqual({ n: 0 })
  })
})
