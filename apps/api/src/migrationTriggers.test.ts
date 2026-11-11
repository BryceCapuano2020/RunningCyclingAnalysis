import { createHash } from 'node:crypto'
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

/**
 * SHA-256 of each trigger's text (whitespace squashed, no final semicolon). Changing a trigger body, in a migration that is
 * not yet applied or by a regenerated one, fails here until the new hash is written down on purpose.
 */
const TRIGGER_SHA256: Record<string, string> = {
  activities_file_bytes_delete: 'a5fe949740f9cd65deb565182fd5f20200a95ee6ef7a64b9cd98289dce6cdf75',
  activities_file_bytes_insert: '3b367edf7f48a8620676004d879c76486723864b89d64c13c09e93a2a61e97bc',
  activities_file_bytes_update: '7456bd32b6cc87e330aa81533a83e4884af212d97f402714d7badd68bc60ceed',
  activities_library_version_delete:
    '9ff7088bba0db2b84ac148f3877272793bcda2983e75fa95985c7e41df659567',
  activities_library_version_insert:
    '16a7b45ef1642208da076a8be1e00ba65f98061a4bcacf430f5afccc7225e804',
  measurements_library_version_delete:
    '365c7a775ad541bef8119d00548248379341adc273d30fc8a9da6f13a9430e6f',
  measurements_library_version_insert:
    '3097299e43c90bc8cbd6d75b44364fc42195747c60b0d0db54457537d7feb095',
  measurements_library_version_update:
    '8186982fc2270986f2255bec89736ca19eba2dbafb3459357710c4fa7e371584',
  profiles_library_version_insert:
    '079fbe6a4a5d5c3a2392123cf2c303e16fcc24502cc79e08b7501e7e7a5eda61',
  profiles_library_version_update:
    '9839619ac1479657f8a24fa4f128fde964c6d514397039f2f350b3ae1e4bb05b',
  settings_library_version_insert:
    '4a70bb142c120620113930384762f9fab850ee2b586f260d95dc6fbdd96a7e4b',
  settings_library_version_update:
    '8b8c4d424fd70539b50269b242b01fe2ce461ba5ed2403962c5793f8740d5eea',
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

const squash = (sql: string) => sql.replace(/\s+/g, ' ').trim()

/**
 * The CREATE TRIGGER statements of the migration files, by trigger name, whitespace squashed and without the final
 * semicolon. A file is split on its statement-breakpoint markers, so an `END;` inside a body (a CASE) never ends one early.
 */
function triggersIn(text: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const chunk of text.split(/-->\s*statement-breakpoint/)) {
    const statement = chunk
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
      .trim()
    const name = /^CREATE TRIGGER\s+`?(\w+)`?/.exec(statement)?.[1]
    if (name === undefined) continue
    expect(statement.match(/CREATE TRIGGER/g), name).toHaveLength(1)
    found.set(name, squash(statement.replace(/;$/, '')))
  }
  return found
}

function writtenTriggers(): Map<string, string> {
  const written = new Map<string, string>()
  for (const { tag } of journal()) {
    const text = readFileSync(new URL(`${tag}.sql`, MIGRATIONS), 'utf8')
    for (const [name, sql] of triggersIn(text)) written.set(name, sql)
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

  it('leave each trigger with the text the migration wrote, and that text is the pinned one', () => {
    const written = writtenTriggers()
    expect([...written.keys()].sort()).toEqual(EXPECTED_TRIGGERS)
    expect(Object.keys(TRIGGER_SHA256).sort()).toEqual(EXPECTED_TRIGGERS)
    for (const [name, sql] of migratedTriggers()) {
      expect(sql, name).toBe(written.get(name))
      expect(sha256(sql), `${name}: its body changed`).toBe(TRIGGER_SHA256[name])
    }
  })

  it('reads a trigger whose body holds a CASE ... END; as one statement', () => {
    const body =
      'CREATE TRIGGER `t` AFTER INSERT ON `x` BEGIN UPDATE y SET a = CASE WHEN 1 THEN 2 END; END;'
    const found = triggersIn(`${body}--> statement-breakpoint\nCREATE INDEX i ON x (a);`)
    expect([...found]).toEqual([['t', body.slice(0, -1)]])
  })
})
