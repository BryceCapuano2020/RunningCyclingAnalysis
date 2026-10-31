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
import { readJsonBody } from './shared.ts'

const LABEL_BODY_BYTES = 64 * 1024

/** Changes sent to D1 in one batch. Each is three statements, so a batch is 75. */
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
 * (?5, empty for none) the client read.
 */
const SAME_ROW = `id = ?2 AND user_id = ?3 AND json_valid(digest_json)
    AND coalesce(json_extract(digest_json, '$.modelRevision'), 1) = ?4
    AND coalesce(json_extract(digest_json, '$.athleteType'), '') = ?5`

/**
 * A change is three statements in one D1 batch, which commits or rolls back whole. The first marks the
 * row: it writes a pending label that records the row's size before the change. The marker is what the
 * other two read, so each is conditioned on the state the first left, not on a count of rows changed. A
 * legitimate label is one of four words, so no stored value looks like the marker.
 */
const PENDING = 'pending:'
const IS_MARKED = `json_valid(digest_json)
    AND substr(coalesce(json_extract(digest_json, '$.athleteType'), ''), 1, ${PENDING.length}) = '${PENDING}'`

/**
 * 1. Marks the row, but only the row above, while the account is open, and a change that grows the digest
 * only while the account is under its cap and the database under its soft limit. It reads the counter
 * before anything has moved it.
 */
const MARK = `UPDATE activities
  SET digest_json = json_set(digest_json, '$.athleteType',
    '${PENDING}' || length(CAST(digest_json AS BLOB)))
  WHERE ${SAME_ROW}
    AND EXISTS (SELECT 1 FROM users WHERE id = ?3 AND deleting_at IS NULL)
    AND (${DELTA} <= 0 OR (
      (SELECT digest_bytes FROM users WHERE id = ?3) + ${DELTA} <= ?6
      AND coalesce((SELECT d1_size_bytes FROM r2_storage_budget WHERE id = 1), 0) <= ?7))`

/**
 * 2. Moves the counter by the size the row will have once the label is written, less the size the marker
 * recorded. It does nothing unless the row is marked.
 */
const COUNT = `UPDATE users
  SET digest_bytes = digest_bytes + (
    SELECT length(CAST(${NEXT_JSON} AS BLOB))
      - CAST(substr(json_extract(digest_json, '$.athleteType'), ${PENDING.length + 1}) AS INTEGER)
    FROM activities WHERE id = ?2 AND user_id = ?3 AND ${IS_MARKED})
  WHERE id = ?3
    AND EXISTS (SELECT 1 FROM activities WHERE id = ?2 AND user_id = ?3 AND ${IS_MARKED})`

/** 3. Writes the label over the marker, or removes the key. Again only a marked row. */
const WRITE = `UPDATE activities SET digest_json = ${NEXT_JSON}
  WHERE id = ?2 AND user_id = ?3 AND ${IS_MARKED}`

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
        c.env.DB.prepare(MARK).bind(
          change.athleteType,
          change.id,
          userId,
          change.revision,
          change.from ?? '',
          MAX_DIGEST_BYTES_PER_USER,
          softLimit,
        ),
        c.env.DB.prepare(COUNT).bind(change.athleteType, change.id, userId),
        c.env.DB.prepare(WRITE).bind(change.athleteType, change.id, userId),
      ]),
    )
    group.forEach((change, index) => {
      if (results[3 * index + 2]?.meta.changes === 1) applied++
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
    else if (
      row.revision === change.revision &&
      // The raw stored value, so something that is not a label reads as a change, not a refusal.
      (row.athleteType ?? '') === (change.from ?? '')
    ) {
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
