import { Hono } from 'hono'
import {
  ActivityLabelsSchema,
  AthleteLabelSchema,
  MAX_DIGEST_BYTES_PER_USER,
  type ActivityLabelsResult,
  type LabelChange,
} from '@rca/contract'
import type { AppEnv } from '../../env.ts'
import { chargeDaily } from '../../budget.ts'
import { databaseSoftLimitBytes } from '../../databaseGuard.ts'
import { invalidRequest, limitBody } from '../../http.ts'
import { currentUser, requireUser } from '../../middleware.ts'
import { recordDatabaseSize } from '../../storage.ts'
import { requireCurrentLabelRevisions } from './revisionCheck.ts'
import { readJsonBody } from './shared.ts'

const LABEL_BODY_BYTES = 64 * 1024

/** Changes sent to D1 in one batch. Each is two statements, so a batch is 50. */
const CHANGES_PER_BATCH = 25

/** D1 binds at most 100 values to one statement. */
const IDS_PER_LOOKUP = 90

/**
 * The stored text with the label set (?1), or removed when ?1 is null. The label is a short word from a
 * fixed list, so it needs no escaping; SQLite writes it where the key is, or at the end if there is none.
 */
const NEXT_JSON = `CASE WHEN ?1 IS NULL THEN json_remove(digest_json, '$.athleteType')
    ELSE json_set(digest_json, '$.athleteType', ?1) END`

/** What the change does to the row's size in bytes, computed from the stored text itself. */
const DELTA = `(length(CAST(${NEXT_JSON} AS BLOB)) - length(CAST(digest_json AS BLOB)))`

/**
 * The row a change applies to: the account's own, still holding the model revision (?4) and the label
 * (?5, empty for none) the client read. One fragment, so the counter and the row cannot disagree.
 */
const SAME_ROW = `id = ?2 AND user_id = ?3 AND json_valid(digest_json)
    AND coalesce(json_extract(digest_json, '$.modelRevision'), 1) = ?4
    AND coalesce(json_extract(digest_json, '$.athleteType'), '') = ?5`

/**
 * First of a change's two statements: moves the account's digest counter by the change's size, but only
 * for the row above, while the account is open, and a change that grows the digest only while the account
 * is under its cap and the database under its soft limit. It reads the text before the row changes.
 */
const RESERVE = `UPDATE users
  SET digest_bytes = digest_bytes + (SELECT ${DELTA} FROM activities WHERE ${SAME_ROW})
  WHERE id = ?3 AND deleting_at IS NULL
    AND EXISTS (
      SELECT 1 FROM activities WHERE ${SAME_ROW}
        AND (${DELTA} <= 0 OR (
          users.digest_bytes + ${DELTA} <= ?6
          AND coalesce((SELECT d1_size_bytes FROM r2_storage_budget WHERE id = 1), 0) <= ?7)))`

/**
 * Second: writes the label, but only if the statement before it moved the counter (`changes()` is the rows
 * that one changed), so the row and the counter move together or not at all.
 */
const APPLY = `UPDATE activities SET digest_json = ${NEXT_JSON}
  WHERE id = ?2 AND user_id = ?3 AND changes() = 1`

/** The rows a lookup finds: what a missed change's row holds now. */
interface HeldRow {
  id: string
  revision: number
  athleteType: unknown
}

async function lookup(db: D1Database, userId: string, ids: string[]): Promise<HeldRow[]> {
  const rows: HeldRow[] = []
  for (let start = 0; start < ids.length; start += IDS_PER_LOOKUP) {
    const chunk = ids.slice(start, start + IDS_PER_LOOKUP)
    const marks = chunk.map((_, index) => `?${index + 2}`).join(',')
    const found = await db
      .prepare(
        `SELECT id,
           CASE WHEN json_valid(digest_json) THEN coalesce(json_extract(digest_json, '$.modelRevision'), 1) ELSE 1 END AS revision,
           CASE WHEN json_valid(digest_json) THEN json_extract(digest_json, '$.athleteType') END AS athleteType
         FROM activities WHERE user_id = ?1 AND id IN (${marks})`,
      )
      .bind(userId, ...chunk)
      .all<HeldRow>()
    rows.push(...found.results)
  }
  return rows
}

/** The label stored in a row, or null when it holds none or something that is not a label. */
function labelOf(stored: unknown): LabelChange['from'] {
  const parsed = AthleteLabelSchema.safeParse(stored)
  return parsed.success ? parsed.data : null
}

export const labelRoutes = new Hono<AppEnv>()

/**
 * Sets or clears the athlete's label on saved activities, in place and without sending a digest up. A
 * change applies only to a row that still holds the revision and label the client read (a rebuild or
 * another change in between makes it a miss, answered with what the row holds now), and `modelRevision`
 * is never touched. The whole request is one profile write.
 */
labelRoutes.patch('/labels', limitBody(LABEL_BODY_BYTES), requireUser, async (c) => {
  const userId = currentUser(c).id
  const body = await readJsonBody(c.req.raw, LABEL_BODY_BYTES)
  requireCurrentLabelRevisions(body)
  const parsed = ActivityLabelsSchema.safeParse(body)
  if (!parsed.success) return c.json(invalidRequest(parsed.error), 400)
  const { labels } = parsed.data
  const { deps } = c.var
  await chargeDaily(c.env.DB, userId, 'profileWrite', deps.now())

  const softLimit = databaseSoftLimitBytes(c.env)
  const unapplied: LabelChange[] = []
  let applied = 0
  let sizeAfter: number | null = null
  for (let start = 0; start < labels.length; start += CHANGES_PER_BATCH) {
    const group = labels.slice(start, start + CHANGES_PER_BATCH)
    const results = await c.env.DB.batch(
      group.flatMap((change) => [
        c.env.DB.prepare(RESERVE).bind(
          change.athleteType,
          change.id,
          userId,
          change.revision,
          change.from ?? '',
          MAX_DIGEST_BYTES_PER_USER,
          softLimit,
        ),
        c.env.DB.prepare(APPLY).bind(change.athleteType, change.id, userId),
      ]),
    )
    group.forEach((change, index) => {
      if (results[2 * index + 1]?.meta.changes === 1) applied++
      else unapplied.push(change)
    })
    sizeAfter = results.at(-1)?.meta.size_after ?? sizeAfter
  }
  // The writes may have grown the database, so the size the create guard reads is recorded.
  if (applied > 0 && sizeAfter !== null) await recordDatabaseSize(c.env.DB, deps.now(), sizeAfter)

  const held = new Map(
    (
      await lookup(
        c.env.DB,
        userId,
        unapplied.map(({ id }) => id),
      )
    ).map((row) => [row.id, row]),
  )
  const result: ActivityLabelsResult = { applied, skipped: 0, refused: 0, missed: [] }
  for (const change of unapplied) {
    const row = held.get(change.id)
    if (row === undefined) result.skipped++
    else if (row.revision === change.revision && labelOf(row.athleteType) === change.from) {
      result.refused++
    } else {
      result.missed.push({
        id: row.id,
        revision: row.revision,
        athleteType: labelOf(row.athleteType),
      })
    }
  }
  return c.json(result, 200)
})
