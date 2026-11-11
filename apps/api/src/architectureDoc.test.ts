import { readFileSync } from 'node:fs'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'
import { schema } from './db/schema.ts'

/* The data model table in docs/ARCHITECTURE.md, pinned to the schema: the one cross-check the map keeps. */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const doc = read('../../../docs/ARCHITECTURE.md')

/** The data model table: table name to the backticked names in its column cell, leaving out the values in brackets. */
function documentedColumns(): Map<string, string[]> {
  const lines = doc.split('\n')
  const start = lines.findIndex((line) => line.startsWith('### D1'))
  const rows = new Map<string, string[]>()
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('#')) break
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
    expect([...documented.keys()].sort(), HINT).toEqual(tables.map((table) => table.name).sort())
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
})
