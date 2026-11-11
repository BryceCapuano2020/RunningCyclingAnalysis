import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

/** Migration 0019: the lift revision a compute covered and the order columns of the stored snapshot. */
const MIGRATIONS = new URL('../migrations/', import.meta.url)
const TAG = '0019_state_lift_order'

function migrated(until: string): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', MIGRATIONS), 'utf8')) as {
    entries: { tag: string }[]
  }
  for (const { tag } of journal.entries) {
    if (tag === TAG && until === TAG) {
      // A job row that exists before the migration: every new column reads 0 for it.
      db.exec(
        "INSERT INTO users (id, email, name, created_at) VALUES ('u1', 'a@example.test', 'A', 1)",
      )
      db.exec("INSERT INTO state_jobs (user_id, computed_version) VALUES ('u1', 4)")
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

describe('migration 0019', () => {
  it('is in the journal after the analysis revision and the name override', () => {
    const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', MIGRATIONS), 'utf8')) as {
      entries: { tag: string }[]
    }
    const tags = journal.entries.map((entry) => entry.tag)
    expect(tags.indexOf(TAG)).toBeGreaterThan(tags.indexOf('0017_activity_name_override'))
  })

  it('adds three integer columns, not null, default 0, and backfills an existing row to 0', () => {
    const db = migrated(TAG)
    const columns = db.prepare("PRAGMA table_info('state_jobs')").all() as {
      name: string
      type: string
      notnull: number
      dflt_value: string
    }[]
    for (const name of ['computed_lift_revision', 'snapshot_lift_revision', 'snapshot_now_ms']) {
      expect(columns.find((c) => c.name === name)).toMatchObject({
        type: 'INTEGER',
        notnull: 1,
        dflt_value: '0',
      })
    }
    expect(db.prepare("SELECT * FROM state_jobs WHERE user_id = 'u1'").get()).toMatchObject({
      computed_version: 4,
      computed_lift_revision: 0,
      snapshot_lift_revision: 0,
      snapshot_now_ms: 0,
    })
  })
})
