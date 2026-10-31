import { open, readFile, realpath, rm, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const TABLES = [
  'activities',
  'oauth_accounts',
  'profiles',
  'r2_storage_budget',
  'sessions',
  'users',
  'd1_migrations',
]
/** Tables added after the first schema. Exports without them (pre-migration) still restore. */
const OPTIONAL_TABLES = [
  'daily_budget',
  'upload_slots',
  'pending_account_deletions',
  'athlete_measurements',
  'identity_budget',
  'account_tombstones',
]
const TABLE_SET = new Set([...TABLES, ...OPTIONAL_TABLES])
export const MAX_D1_EXPORT_BYTES = 64 * 1024 * 1024

const quoteIdentifier = (identifier) => `"${identifier.replaceAll('"', '""')}"`

function sqlLiteral(value) {
  if (value === null) return 'NULL'
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
      throw new Error('Export contains an unsupported numeric value.')
    }
    return Object.is(value, -0) ? '0' : value.toString()
  }
  if (typeof value === 'string') {
    if (value.includes('\0')) {
      return `CAST(X'${Buffer.from(value, 'utf8').toString('hex')}' AS TEXT)`
    }
    return `'${value.replaceAll("'", "''")}'`
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return `X'${Buffer.from(value).toString('hex')}'`
  }
  throw new Error('Export contains an unsupported SQLite value.')
}

function requireKnownSchema(db) {
  const objects = db
    .prepare(
      `SELECT type, name, sql FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
    )
    .all()
  const tables = objects.filter((object) => object.type === 'table')
  const unsupported = objects.filter(
    (object) => !['table', 'index', 'trigger'].includes(object.type),
  )
  if (unsupported.length) {
    throw new Error(`Export contains unsupported SQLite object type: ${unsupported[0].type}.`)
  }
  const names = new Set(tables.map((table) => table.name))
  for (const name of names) {
    if (!TABLE_SET.has(name)) throw new Error(`Export contains unsupported table: ${name}.`)
  }
  const missing = TABLES.filter((name) => !names.has(name))
  if (missing.length) throw new Error(`Export is missing required table: ${missing[0]}.`)
  for (const table of tables) {
    if (typeof table.sql !== 'string' || !/^\s*CREATE\s+TABLE\b/i.test(table.sql)) {
      throw new Error(`Export contains unsupported table definition: ${table.name}.`)
    }
  }
  return objects
}

function getTableOrder(db, names) {
  const tables = [...names].sort()
  const parents = new Map(tables.map((name) => [name, new Set()]))
  for (const child of tables) {
    const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(child)})`).all()
    for (const foreignKey of foreignKeys) {
      const parent = foreignKey.table
      if (!TABLE_SET.has(parent)) {
        throw new Error(`Table ${child} references unsupported table ${parent}.`)
      }
      parents.get(child).add(parent)
    }
  }

  const remainingParents = new Map([...parents].map(([child, refs]) => [child, new Set(refs)]))
  const ordered = []
  while (remainingParents.size) {
    const ready = [...remainingParents]
      .filter(([, refs]) => [...refs].every((parent) => !remainingParents.has(parent)))
      .map(([name]) => name)
      .sort()
    if (!ready.length) throw new Error('Export schema contains a foreign-key cycle.')
    for (const name of ready) {
      ordered.push(name)
      remainingParents.delete(name)
    }
  }
  return ordered
}

function checkDatabase(db) {
  const integrity = db.prepare('PRAGMA integrity_check').get()
  if (!integrity || Object.values(integrity)[0] !== 'ok') {
    throw new Error('Export failed SQLite integrity_check.')
  }
  const foreignKeyIssues = db.prepare('PRAGMA foreign_key_check').all()
  if (foreignKeyIssues.length) {
    const { table } = foreignKeyIssues[0]
    throw new Error(`Export contains a foreign-key violation in table ${table}.`)
  }
}

function* serializeTableRows(db, tableName) {
  const name = quoteIdentifier(tableName)
  const columns = db
    .prepare(`PRAGMA table_info(${name})`)
    .all()
    .map((column) => column.name)
  if (!columns.length) throw new Error(`Export table has no readable columns: ${tableName}.`)
  const select = db.prepare(`SELECT * FROM ${name}`)
  select.setReadBigInts(true)
  const columnList = columns.map(quoteIdentifier).join(', ')
  for (const row of select.iterate()) {
    yield `INSERT INTO ${name} (${columnList}) VALUES (${columns.map((column) => sqlLiteral(row[column])).join(', ')});`
  }
}

const TRIGGER_START =
  /^\s*(?:(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)*CREATE\s+(?:TEMP\s+|TEMPORARY\s+)?TRIGGER\b/i

/** The index just past the quoted text that opens at `opening`, whose quote doubles to escape itself. */
function endOfQuoted(sql, opening) {
  const quote = sql[opening] === '[' ? ']' : sql[opening]
  let at = opening + 1
  for (;;) {
    at = sql.indexOf(quote, at)
    if (at === -1) return sql.length
    if (quote === ']' || sql[at + 1] !== quote) return at + 1
    at += 2
  }
}

/**
 * Splits an export into statements at the semicolons that sit outside quotes and comments. A
 * trigger holds semicolons of its own, so it ends at the semicolon that follows its END.
 */
function splitStatements(sql) {
  const statements = []
  let start = 0
  let lastWord = ''
  let at = 0
  while (at < sql.length) {
    const char = sql[at]
    const pair = sql.slice(at, at + 2)
    if (char === "'" || char === '"' || char === '`' || char === '[') {
      at = endOfQuoted(sql, at)
      lastWord = ''
    } else if (pair === '--' || pair === '/*') {
      const close = sql.indexOf(pair === '--' ? '\n' : '*/', at)
      at = close === -1 ? sql.length : close + (pair === '--' ? 1 : 2)
    } else if (/\w/.test(char)) {
      const word = /^\w+/.exec(sql.slice(at, at + 64))[0]
      lastWord = word.toUpperCase()
      at += word.length
    } else {
      if (char === ';' && !(TRIGGER_START.test(sql.slice(start, at)) && lastWord !== 'END')) {
        statements.push(sql.slice(start, at + 1))
        start = at + 1
      }
      if (!/\s/.test(char)) lastWord = ''
      at += 1
    }
  }
  if (sql.slice(start).trim()) statements.push(sql.slice(start))
  return statements
}

/**
 * Loads an export into an empty database with its triggers held back until every row is in. A
 * trigger that ran over rows already stored would apply their changes a second time, as a counter
 * that follows another column would. The restored database gets the triggers, after the rows.
 */
function loadExport(db, exportSql) {
  const statements = splitStatements(exportSql)
  const isTrigger = (statement) => TRIGGER_START.test(statement)
  db.exec(statements.filter((statement) => !isTrigger(statement)).join('\n'))
  db.exec(statements.filter(isTrigger).join('\n'))
}

/** Convert a trusted Cloudflare D1 SQL export to schema-first, FK-ordered restore SQL. */
export function prepareD1RestoreSql(exportSql) {
  if (typeof exportSql !== 'string') {
    throw new Error('Input is not a non-empty D1 SQL export.')
  }
  if (Buffer.byteLength(exportSql, 'utf8') > MAX_D1_EXPORT_BYTES) {
    throw new Error(
      'D1 export exceeds the 64 MiB preparation limit; use a separately validated restore procedure for larger exports.',
    )
  }
  if (!exportSql.trim()) throw new Error('Input is not a non-empty D1 SQL export.')
  const db = new DatabaseSync(':memory:')
  try {
    db.exec('PRAGMA foreign_keys=OFF;')
    loadExport(db, exportSql)
    const objects = requireKnownSchema(db)
    checkDatabase(db)
    const tableOrder = getTableOrder(
      db,
      objects.filter((object) => object.type === 'table').map((object) => object.name),
    )
    const tableSql = objects
      .filter((object) => object.type === 'table')
      .sort((a, b) => tableOrder.indexOf(a.name) - tableOrder.indexOf(b.name))
      .map((object) => `${object.sql};`)
    const indexSql = objects
      .filter((object) => object.type === 'index' && object.sql)
      .map((object) => `${object.sql};`)
    const triggerSql = objects
      .filter((object) => object.type === 'trigger' && object.sql)
      .map((object) => `${object.sql};`)

    const statements = [...tableSql]
    for (const tableName of tableOrder) {
      for (const rowSql of serializeTableRows(db, tableName)) statements.push(rowSql)
    }

    const hasSequence = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'")
      .get()
    if (hasSequence) {
      statements.push('DELETE FROM sqlite_sequence;')
      const sequenceStatement = db.prepare('SELECT name, seq FROM sqlite_sequence ORDER BY name')
      sequenceStatement.setReadBigInts(true)
      const sequenceRows = sequenceStatement.all()
      for (const sequence of sequenceRows) {
        const name = sqlLiteral(sequence.name)
        const value = typeof sequence.seq === 'bigint' ? sequence.seq.toString() : sequence.seq
        statements.push(`INSERT INTO sqlite_sequence(name, seq) VALUES (${name}, ${value});`)
      }
    }
    statements.push(...indexSql, ...triggerSql)
    return `${statements.join('\n')}\n`
  } finally {
    db.close()
  }
}

export async function prepareD1RestoreFile(inputPath, outputPath) {
  const input = resolve(inputPath)
  const output = resolve(outputPath)
  const inputRealPath = await realpath(input)
  if (output === input || (await realpath(output).catch(() => null)) === inputRealPath) {
    throw new Error('Output path must not overwrite the source export.')
  }
  if ((await stat(input)).size > MAX_D1_EXPORT_BYTES) {
    throw new Error(
      'D1 export exceeds the 64 MiB preparation limit; use a separately validated restore procedure for larger exports.',
    )
  }
  const source = await readFile(input, 'utf8')
  const restoreSql = prepareD1RestoreSql(source)
  let handle
  let created = false
  try {
    handle = await open(output, 'wx', 0o600)
    created = true
    await handle.writeFile(restoreSql, 'utf8')
    await handle.sync()
    await handle.close()
    handle = undefined
    const mode = (await stat(output)).mode & 0o777
    if (mode !== 0o600) {
      await rm(output, { force: true })
      throw new Error('Could not create private restore output (expected file mode 0600).')
    }
  } catch (error) {
    if (handle) await handle.close().catch(() => {})
    if (created) await rm(output, { force: true }).catch(() => {})
    if (error.code === 'EEXIST')
      throw new Error('Output file already exists; refusing to overwrite it.', { cause: error })
    throw error
  }
  return { input, output, bytes: Buffer.byteLength(restoreSql) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , inputPath, outputPath] = process.argv
  if (!inputPath || !outputPath || process.argv.length !== 4) {
    console.error(
      'Usage: node apps/api/scripts/prepare-d1-restore.mjs <trusted-export.sql> <new-output.sql>',
    )
    process.exitCode = 2
  } else {
    try {
      const result = await prepareD1RestoreFile(inputPath, outputPath)
      console.log(`Prepared validated restore SQL at ${result.output} (${result.bytes} bytes).`)
    } catch (error) {
      console.error(`Could not prepare D1 restore: ${error.message}`)
      process.exitCode = 1
    }
  }
}
