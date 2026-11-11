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

function migratedTriggers(): string[] {
  const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', MIGRATIONS), 'utf8')) as {
    entries: { tag: string }[]
  }
  const db = new DatabaseSync(':memory:')
  for (const { tag } of journal.entries) {
    db.exec(readFileSync(new URL(`${tag}.sql`, MIGRATIONS), 'utf8'))
  }
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
    .all()
  db.close()
  return rows.map((row) => String(row.name))
}

describe('migrations on a fresh database', () => {
  it('leave exactly the triggers the counters depend on', () => {
    expect(migratedTriggers()).toEqual(EXPECTED_TRIGGERS)
  })
})
