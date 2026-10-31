import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { e2eApiPort } from './ports.js'

/** The local D1 files `npm run e2e:api` keeps for this run (see apps/api/package.json). */
const D1_DIR = fileURLToPath(
  new URL(
    `../../api/.wrangler/e2e-state-${e2eApiPort}/v3/d1/miniflare-D1DatabaseObject/`,
    import.meta.url,
  ),
)

/**
 * Rewrites the model revision a saved activity's digest carries, straight in the local database. The
 * server refuses to create a digest from a stale model, so a library from an older build is made this way:
 * create the row at the current revision, then set it back. The digest is otherwise untouched.
 */
export function setStoredRevision(activityId: string, revision: number): void {
  const file = readdirSync(D1_DIR).find(
    (name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite',
  )
  if (file === undefined) throw new Error(`No local D1 database in ${D1_DIR}`)
  const db = new DatabaseSync(`${D1_DIR}${file}`)
  try {
    db.exec('PRAGMA busy_timeout = 5000')
    const result = db
      .prepare(
        `UPDATE activities SET digest_json = json_set(digest_json, '$.modelRevision', ?) WHERE id = ?`,
      )
      .run(revision, activityId)
    if (result.changes !== 1)
      throw new Error(`Expected to rewrite one activity, changed ${result.changes}`)
  } finally {
    db.close()
  }
}
