import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

/** Migration 0018 (Garmin sync): two new tables and a defaulted column, additive for every earlier Worker. */
const MIGRATIONS = new URL('../migrations/', import.meta.url)

/** Every migration applied, with one user and one activity written by a Worker from before 0018. */
function migrated(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', MIGRATIONS), 'utf8')) as {
    entries: { tag: string }[]
  }
  for (const { tag } of journal.entries) {
    if (tag === '0018_garmin_sync') {
      db.exec(
        "INSERT INTO users (id, email, name, created_at) VALUES ('u1', 'a@example.test', 'A', 1)",
      )
      db.exec(
        `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version, digest_json,
           file_name, file_hash, created_at)
         VALUES ('before', 'u1', 'k0', 'run', 1, 'n', 1, '{}', 'a.fit', 'h', 1)`,
      )
    }
    db.exec(
      readFileSync(new URL(`${tag}.sql`, MIGRATIONS), 'utf8').replaceAll(
        '--> statement-breakpoint',
        '',
      ),
    )
  }
  return db
}

/** An insert as a Worker from before 0018 writes it: it names no source. */
const OLDER_INSERT = `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
  digest_json, file_name, file_hash, created_at) VALUES (?, 'u1', ?, 'ride', 2, 'n', 1, '{}', 'b.fit', 'h', 2)`

function inboxInsert(id: string, activityId: string, state = 'pending') {
  return [
    `INSERT INTO inbox_items (id, user_id, provider, provider_activity_id, state, received_at)
     VALUES (?, 'u1', 'garmin', ?, ?, 1)`,
    [id, activityId, state],
  ] as const
}

describe('migration 0018', () => {
  it('marks every existing activity, and one an earlier Worker inserts, as from a file', () => {
    const db = migrated()
    db.prepare(OLDER_INSERT).run('after', 'k1')
    expect(db.prepare('SELECT id, source FROM activities ORDER BY id').all()).toEqual([
      { id: 'after', source: 'file' },
      { id: 'before', source: 'file' },
    ])
  })

  it('links one Garmin account to one account, and an account to Garmin once', () => {
    const db = migrated()
    db.exec(
      "INSERT INTO users (id, email, name, created_at) VALUES ('u2', 'b@example.test', 'B', 1)",
    )
    const link = db.prepare(
      `INSERT INTO provider_links (user_id, provider, provider_user_id, token_ciphertext, key_id, scopes, linked_at)
       VALUES (?, 'garmin', ?, 'c', 'k1', '', 1)`,
    )
    link.run('u1', 'g1')
    expect(() => link.run('u2', 'g1')).toThrow(/UNIQUE/)
    expect(() => link.run('u1', 'g2')).toThrow(/UNIQUE/)
  })

  it('stores one item per pushed activity, in a known state', () => {
    const db = migrated()
    const [sql, values] = inboxInsert('i1', 'g-activity-1')
    db.prepare(sql).run(...values)
    expect(() => db.prepare(sql).run('i2', 'g-activity-1', 'pending')).toThrow(/UNIQUE/)
    expect(() => db.prepare(sql).run('i3', 'g-activity-3', 'lost')).toThrow(/CHECK/)
  })

  it('deletes the link and the inbox with the user', () => {
    const db = migrated()
    db.exec(
      `INSERT INTO provider_links (user_id, provider, provider_user_id, token_ciphertext, key_id, scopes, linked_at)
       VALUES ('u1', 'garmin', 'g1', 'c', 'k1', '', 1)`,
    )
    const [sql, values] = inboxInsert('i1', 'g-activity-1')
    db.prepare(sql).run(...values)
    db.exec("DELETE FROM users WHERE id = 'u1'")
    expect(db.prepare('SELECT COUNT(*) AS n FROM provider_links').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM inbox_items').get()).toEqual({ n: 0 })
  })
})
