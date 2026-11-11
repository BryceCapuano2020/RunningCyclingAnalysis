import { Hono } from 'hono'
import {
  ActivityRenameSchema,
  MAX_DIGEST_BYTES,
  MAX_DIGEST_BYTES_PER_USER,
  type ActivityRenameResult,
} from '@rca/contract'
import type { AppEnv } from '../../env.ts'
import { chargeDaily } from '../../budget.ts'
import { databaseSoftLimitBytes } from '../../databaseGuard.ts'
import { HttpError, accountDeleting } from '../../errors.ts'
import { invalidRequest, limitBody } from '../../http.ts'
import { currentUser, requireUser } from '../../middleware.ts'
import { accountState, databaseFull, digestQuota } from './quota.ts'
import { readJsonBody } from './shared.ts'

const RENAME_BODY_BYTES = 4 * 1024

/**
 * What the change does to the row's size in bytes, read from the stored text itself before the row changes.
 * The name is the athlete's own text, bound as a parameter and written by SQLite as a JSON string.
 */
const GROWTH = `(SELECT length(CAST(json_set(a.digest_json, '$.name', ?1) AS BLOB)) - length(CAST(a.digest_json AS BLOB))
    FROM activities a WHERE a.id = ?2 AND a.user_id = ?3)`

/**
 * 1. Moves the counters and raises the library version (the name is an input of the results: no trigger does it, see
 * migration 0014): only for the account's own row, while the account is open, and a name that grows the digest only
 * while the digest stays within its limit, the account under its cap and the database under its soft limit.
 */
const COUNT = `UPDATE users
  SET library_version = library_version + 1, digest_bytes = digest_bytes + ${GROWTH}
  WHERE id = ?3 AND deleting_at IS NULL
    AND EXISTS (SELECT 1 FROM activities WHERE id = ?2 AND user_id = ?3 AND json_valid(digest_json))
    AND (${GROWTH} <= 0 OR (
      digest_bytes + ${GROWTH} <= ?4
      AND (SELECT length(CAST(json_set(a.digest_json, '$.name', ?1) AS BLOB)) FROM activities a
        WHERE a.id = ?2 AND a.user_id = ?3) <= ?5
      AND coalesce((SELECT d1_size_bytes FROM r2_storage_budget WHERE id = 1), 0) <= ?6))`

/**
 * 2. Writes the name where the file's own name was, in the digest and the column, and keeps it as the override that a
 * rebuilt digest is given back (storedLabel.ts). It applies only if the first statement did, so the two commit or
 * roll back together.
 */
const WRITE = `UPDATE activities
  SET digest_json = json_set(digest_json, '$.name', ?1), name = ?1, name_override = ?1
  WHERE id = ?2 AND user_id = ?3 AND changes() = 1`

export const renameRoutes = new Hono<AppEnv>()

/**
 * Sets the name of one saved activity, in place and without sending a digest up. A name is the athlete's own
 * and survives a rebuilt or re-imported digest of the same file. The name is 1 to 100 characters after trimming
 * (RENAME schema, MAX_ACTIVITY_NAME_CHARS). The write is one profile write.
 */
renameRoutes.patch('/:id/name', limitBody(RENAME_BODY_BYTES), requireUser, async (c) => {
  const userId = currentUser(c).id
  const id = c.req.param('id')
  const parsed = ActivityRenameSchema.safeParse(await readJsonBody(c.req.raw, RENAME_BODY_BYTES))
  if (!parsed.success) return c.json(invalidRequest(parsed.error), 400)
  const { name } = parsed.data
  const { deps } = c.var
  await chargeDaily(c.env.DB, userId, 'profileWrite', deps.now())

  const [counted, written] = await c.env.DB.batch([
    c.env.DB.prepare(COUNT).bind(
      name,
      id,
      userId,
      MAX_DIGEST_BYTES_PER_USER,
      MAX_DIGEST_BYTES,
      databaseSoftLimitBytes(c.env),
    ),
    c.env.DB.prepare(WRITE).bind(name, id, userId),
  ])
  if (written?.meta.changes !== 1 || counted?.meta.changes !== 1) {
    const owned = await c.env.DB.prepare(
      'SELECT 1 AS found FROM activities WHERE id = ? AND user_id = ?',
    )
      .bind(id, userId)
      .first()
    if (owned === null) throw new HttpError(404, 'not_found', 'Activity not found')
    const state = await accountState(c.env.DB, userId)
    if (state.deletingAt !== null) throw accountDeleting()
    if (state.databaseBytes > databaseSoftLimitBytes(c.env)) throw databaseFull()
    throw digestQuota()
  }
  return c.json({ name } satisfies ActivityRenameResult, 200)
})
