import { readFileSync, readdirSync } from 'node:fs'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { MAX_PAGE_SIZE } from '@rca/contract'
import { describe, expect, it } from 'vitest'
import { schema } from './db/schema.ts'
import { SESSION_ABSOLUTE_MS, SESSION_REFRESH_WITHIN_MS, SESSION_TTL_MS } from './auth/session.ts'

/*
 * The API and database facts docs/ARCHITECTURE.md states, pinned to the schema, the migrations and the
 * constants behind them. Whitespace is collapsed, so a phrase the doc wraps is still found.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const doc = read('../../../docs/ARCHITECTURE.md')
const text = doc.replace(/\s+/g, ' ')
const DAY_MS = 24 * 60 * 60 * 1000

/** The data model table: table name to the backticked names in its column cell, leaving out the values in brackets. */
function documentedColumns(): Map<string, string[]> {
  const lines = doc.split('\n')
  const start = lines.findIndex((line) => line.startsWith('## Data model'))
  const rows = new Map<string, string[]>()
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break
    const cells = line.split('|').map((cell) => cell.trim())
    const name = /^`(\w+)`$/.exec(cells[1] ?? '')?.[1]
    if (name !== undefined)
      rows.set(
        name,
        [...(cells[2] ?? '').replace(/\([^)]*\)/g, '').matchAll(/`(\w+)`/g)].map((m) => m[1]!),
      )
  }
  return rows
}

/** Said when a pin fails: the page and the code disagree, and either may be the one that is wrong. */
const HINT =
  'docs/ARCHITECTURE.md and the code disagree: update the doc, or the code if the doc is right.'

describe('architecture doc: the data model table', () => {
  const documented = documentedColumns()
  const tables = Object.values(schema).map((table) => getTableConfig(table))

  it('has a row for every table of the schema, and none for a table that is gone', () => {
    expect([...documented.keys()].sort()).toEqual(tables.map((table) => table.name).sort())
  })

  it.each(tables.map((table) => [table.name, table.columns.map((column) => column.name)] as const))(
    'lists the columns of %s',
    (name, columns) => {
      const listed = documented.get(name) ?? []
      expect(
        listed.filter((column) => !columns.includes(column)),
        'columns the schema lacks',
      ).toEqual([])
      // The deployment-wide ledger names its health-probe counters as a group.
      const unlisted = columns.filter((column) => !listed.includes(column))
      const allowed =
        name === 'r2_storage_budget'
          ? unlisted.filter((c) => !c.startsWith('health_probe'))
          : unlisted
      expect(allowed, 'columns the doc leaves out').toEqual([])
    },
  )

  it('names the migration that added the dated settings', () => {
    const file = readdirSync(new URL('../migrations/', import.meta.url)).find((name) =>
      name.startsWith('0009_'),
    )
    expect(file).toBe('0009_athlete_measurements.sql')
    expect(text, HINT).toContain('(migration 0009)')
  })
})

describe('architecture doc: sessions and pages', () => {
  it('gives the session lifetime, the refresh window and the absolute end', () => {
    expect(text, HINT).toContain(
      `A session lasts ${SESSION_TTL_MS / DAY_MS} days and is extended when it is used with less than ${SESSION_REFRESH_WITHIN_MS / DAY_MS} days left, but never beyond ${SESSION_ABSOLUTE_MS / DAY_MS} days after it was created`,
    )
    expect(text, HINT).toContain(`starts the absolute ${SESSION_ABSOLUTE_MS / DAY_MS}-day lifetime`)
  })

  it('gives the page size of the activity list', () => {
    expect(text, HINT).toContain(`The page size is at most ${MAX_PAGE_SIZE}.`)
  })
})
