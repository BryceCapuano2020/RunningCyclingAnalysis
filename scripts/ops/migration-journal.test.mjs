import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'

// The journal drives drizzle's migrator, which skips any entry whose `when` is not after the last
// applied one. A journal out of order, or a tag with no SQL or snapshot, would apply the wrong
// migrations or none at all.
const MIGRATIONS = new URL('../../apps/api/migrations/', import.meta.url)

function journalEntries() {
  return JSON.parse(readFileSync(new URL('meta/_journal.json', MIGRATIONS), 'utf8')).entries
}

test('journal entries are numbered from 0 with no gaps', () => {
  const idx = journalEntries().map((entry) => entry.idx)
  assert.deepEqual(
    idx,
    idx.map((_, i) => i),
  )
})

test('journal timestamps strictly increase, so the migrator never skips a new entry', () => {
  const entries = journalEntries()
  const outOfOrder = []
  for (let i = 1; i < entries.length; i += 1) {
    if (entries[i].when <= entries[i - 1].when) outOfOrder.push(entries[i].tag)
  }
  assert.deepEqual(outOfOrder, [])
})

test('every journal tag has a SQL file and a snapshot', () => {
  const missing = []
  for (const { tag } of journalEntries()) {
    const prefix = /^\d{4}/.exec(tag)?.[0]
    if (!prefix) missing.push(`${tag}: no numeric prefix`)
    if (!existsSync(new URL(`${tag}.sql`, MIGRATIONS))) missing.push(`${tag}.sql`)
    if (prefix && !existsSync(new URL(`meta/${prefix}_snapshot.json`, MIGRATIONS))) {
      missing.push(`meta/${prefix}_snapshot.json`)
    }
  }
  assert.deepEqual(missing, [])
})

test('every SQL file is recorded in the journal', () => {
  const tags = journalEntries().map((entry) => entry.tag)
  const sqlTags = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => name.slice(0, -'.sql'.length))
  assert.deepEqual(
    sqlTags.filter((tag) => !tags.includes(tag)),
    [],
  )
})
