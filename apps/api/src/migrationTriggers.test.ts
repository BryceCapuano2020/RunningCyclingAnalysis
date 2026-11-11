import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

const MIGRATIONS = new URL('../migrations/', import.meta.url)

/**
 * Triggers keep users.file_bytes (0008) and users.library_version (0014) exact for every writer.
 * drizzle-kit does not model triggers, so a regenerated migration drops them without a type error
 * or a failing route test. Adding or removing a trigger means changing this list on purpose.
 */
const EXPECTED_TRIGGERS = [
  'activities_file_bytes_delete',
  'activities_file_bytes_insert',
  'activities_file_bytes_update',
  'activities_library_version_delete',
  'activities_library_version_insert',
  'measurements_library_version_delete',
  'measurements_library_version_insert',
  'measurements_library_version_update',
  'profiles_library_version_insert',
  'profiles_library_version_update',
  'settings_library_version_insert',
  'settings_library_version_update',
]

const squash = (sql: string) => sql.replace(/\s+/g, ' ').trim()

/** The CREATE TRIGGER statements of the migration files, by trigger name, whitespace squashed and without the final semicolon. */
function writtenTriggers(): Map<string, string> {
  const written = new Map<string, string>()
  for (const { tag } of journal()) {
    const text = readFileSync(new URL(`${tag}.sql`, MIGRATIONS), 'utf8')
    for (const match of text.matchAll(/CREATE TRIGGER\s+`?(\w+)`?[\s\S]*?\bEND\s*;/g)) {
      written.set(match[1]!, squash(match[0].replace(/;$/, '')))
    }
  }
  return written
}

function journal(): { tag: string }[] {
  return (
    JSON.parse(readFileSync(new URL('meta/_journal.json', MIGRATIONS), 'utf8')) as {
      entries: { tag: string }[]
    }
  ).entries
}

/** The triggers a fresh database holds after the migrations, by name, with the text SQLite kept for each. */
function migratedTriggers(): Map<string, string> {
  const db = new DatabaseSync(':memory:')
  for (const { tag } of journal()) {
    db.exec(readFileSync(new URL(`${tag}.sql`, MIGRATIONS), 'utf8'))
  }
  const rows = db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
    .all()
  db.close()
  return new Map(rows.map((row) => [String(row.name), squash(String(row.sql))]))
}

describe('migrations on a fresh database', () => {
  it('leave exactly the triggers the counters depend on', () => {
    expect([...migratedTriggers().keys()]).toEqual(EXPECTED_TRIGGERS)
  })

  it('leave each trigger with the text the migration wrote, so a changed body fails here', () => {
    const written = writtenTriggers()
    expect([...written.keys()].sort()).toEqual(EXPECTED_TRIGGERS)
    for (const [name, sql] of migratedTriggers()) expect(sql, name).toBe(written.get(name))
  })
})
