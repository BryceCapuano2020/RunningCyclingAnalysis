import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { prepareD1RestoreSql } from '../../apps/api/scripts/prepare-d1-restore.mjs'

export const MANIFEST_SCHEMA = 'rca-backup-manifest/v1'

/**
 * Builds the manifest stored beside each backup. The D1 export is validated by the same helper
 * used for restores (known schema, integrity, foreign keys), then row counts are taken from the
 * prepared SQL. `r2Objects` is the S3 ListObjectsV2 `Contents` array: it records what existed,
 * not the object bytes, which are not part of the backup.
 */
export function buildManifest({ exportSql, r2Objects, commit, runId, createdAt }) {
  const restoreSql = prepareD1RestoreSql(exportSql)
  const db = new DatabaseSync(':memory:')
  try {
    db.exec('PRAGMA foreign_keys=OFF;')
    db.exec(restoreSql)
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      )
      .all()
    const rows = {}
    for (const { name } of tables) {
      const quoted = `"${name.replaceAll('"', '""')}"`
      rows[name] = Number(db.prepare(`SELECT count(*) AS n FROM ${quoted}`).get().n)
    }
    const objects = r2Objects
      .map((object) => ({
        key: object.Key,
        size: object.Size,
        etag: object.ETag ?? null,
        lastModified: object.LastModified ?? null,
      }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    return {
      schema: MANIFEST_SCHEMA,
      createdAt,
      commit,
      runId,
      d1: {
        database: 'rca',
        sha256: createHash('sha256').update(exportSql).digest('hex'),
        bytes: Buffer.byteLength(exportSql),
        rows,
      },
      r2: {
        bucket: 'rca-files',
        objectCount: objects.length,
        totalBytes: objects.reduce((sum, object) => sum + object.size, 0),
        note: 'Original files are not included in the backup. This list records what existed.',
        objects,
      },
    }
  } finally {
    db.close()
  }
}

function option(args, name) {
  const index = args.indexOf(name)
  if (index === -1 || !args[index + 1]) throw new Error(`Missing ${name}.`)
  return args[index + 1]
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  try {
    const manifest = buildManifest({
      exportSql: await readFile(option(args, '--export'), 'utf8'),
      r2Objects: JSON.parse(await readFile(option(args, '--r2'), 'utf8')),
      commit: option(args, '--commit'),
      runId: option(args, '--run-id'),
      createdAt: new Date().toISOString(),
    })
    await writeFile(option(args, '--out'), `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o600,
    })
    const tableCount = Object.keys(manifest.d1.rows).length
    console.log(
      `Manifest written: ${tableCount} tables, ${manifest.r2.objectCount} R2 objects listed.`,
    )
  } catch (error) {
    console.error(`Could not build the backup manifest: ${error.message}`)
    process.exitCode = 1
  }
}
