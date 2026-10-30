import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  ActivityCreateSchema,
  MAX_ACTIVITIES_PER_USER,
  MAX_DIGEST_BYTES_PER_USER,
  MAX_DIGEST_BYTES,
} from '@rca/contract'
import type { AppEnv, Db } from '../../env.ts'
import { accountDeleting, HttpError } from '../../errors.ts'
import { currentUser, requireUser } from '../../middleware.ts'
import { invalidRequest, limitBody, readBody } from '../../http.ts'
import { chargeDaily } from '../../budget.ts'
import { recordDatabaseSize } from '../../storage.ts'
import { activities } from '../../db/schema.ts'
import { must } from '../../util.ts'
import {
  ACTIVITY_COLUMNS,
  dedupeKeyFor,
  findOwnedActivity,
  toRecord,
  toRecordHolding,
  type ActivityRow,
} from './shared.ts'
import { databaseSoftLimitBytes } from '../../databaseGuard.ts'
import { requireCurrentRevision } from './revisionCheck.ts'
import { accountState, activityQuota, createRefusal, databaseFull, digestQuota } from './quota.ts'

/** The digest limit applies to its JSON; the envelope (name, hash) gets this much headroom. */
const MAX_CREATE_BODY_BYTES = MAX_DIGEST_BYTES + 16 * 1024

const CONFLICTING_FILE_MESSAGE =
  'This activity already exists with different original file contents'

const createQuery = z.object({
  /** Updates this exact activity, owned by the caller, instead of inserting one. */
  replace: z.string().min(1).max(64).optional(),
})

/** A validated create body, with the values every path below derives from it. */
type CreateInput = z.infer<typeof ActivityCreateSchema> & {
  digestJson: string
  digestBytes: number
  dedupeKey: string
}

/** A stored digest's size: UTF-8 bytes, as SQLite's length(CAST(digest_json AS BLOB)) counts them. */
function digestByteLength(digestJson: string): number {
  return new TextEncoder().encode(digestJson).byteLength
}

/** The request body as parsed JSON, read under the create limit. Anything else is refused. */
async function readJsonBody(request: Request): Promise<unknown> {
  const body = await readBody(request, MAX_CREATE_BODY_BYTES)
  try {
    return JSON.parse(new TextDecoder().decode(body))
  } catch {
    throw new HttpError(400, 'invalid_json', 'Body is not valid JSON')
  }
}

/** The validated body with its derived values. A digest over the size limit is refused here. */
function createInput(data: z.infer<typeof ActivityCreateSchema>): CreateInput {
  const digestJson = JSON.stringify(data.digest)
  const digestBytes = digestByteLength(digestJson)
  if (digestBytes > MAX_DIGEST_BYTES) {
    throw new HttpError(413, 'digest_too_large', 'Activity digest is larger than 256 KB')
  }
  return {
    ...data,
    digestJson,
    digestBytes,
    dedupeKey: dedupeKeyFor(data.digest.sport, data.digest.startMs),
  }
}

/** The caller's activity with this dedupe key, if there is one. */
async function findExisting(
  db: Db,
  userId: string,
  dedupeKey: string,
): Promise<ActivityRow | undefined> {
  return db
    .select()
    .from(activities)
    .where(and(eq(activities.userId, userId), eq(activities.dedupeKey, dedupeKey)))
    .get()
}

/** Moves the digest counter in one guarded write; a refusal is explained from the account. */
async function reserveDigestDelta(
  db: D1Database,
  userId: string,
  delta: number,
  databaseLimit: number,
): Promise<void> {
  // A shrinking digest is always admitted, even by an account already above the cap, and so is one
  // that does not grow while the database is over its soft limit.
  const reserved = await db
    .prepare(
      `UPDATE users SET digest_bytes = digest_bytes + ?1
       WHERE id = ?2 AND deleting_at IS NULL AND (?1 <= 0 OR digest_bytes + ?1 <= ?3)
         AND (?1 <= 0 OR coalesce((SELECT d1_size_bytes FROM r2_storage_budget WHERE id = 1), 0) <= ?4)
       RETURNING id`,
    )
    .bind(delta, userId, MAX_DIGEST_BYTES_PER_USER, databaseLimit)
    .first()
  if (reserved) return
  const state = await accountState(db, userId)
  if (state.deletingAt !== null) throw accountDeleting()
  if (delta > 0 && state.databaseBytes > databaseLimit) {
    throw databaseFull()
  }
  throw digestQuota()
}

/** The digest a newer model revision of the same original file replaces the stored one with. */
interface DigestUpgrade {
  digestJson: string
  digestVersion: number
  name: string
  modelRevision: number
  fileHash: string
}

/**
 * Replaces an activity's digest with a newer model revision of the same original file. The
 * per-user digest counter moves by the size difference before the row changes. If the row no
 * longer matches (another request upgraded or deleted it first) the move is undone and null is
 * returned.
 */
async function upgradeDigest(
  c: Context<AppEnv>,
  userId: string,
  existing: ActivityRow,
  next: DigestUpgrade,
): Promise<ActivityRow | null> {
  const { db, deps } = c.var
  // Only a newer model revision upgrades. Check it before reserving quota, so a request that cannot
  // upgrade is never refused for quota it does not need.
  const stored = await db
    .select({
      revision: sql<number>`coalesce(json_extract(${activities.digestJson}, '$.modelRevision'), 1)`,
    })
    .from(activities)
    .where(eq(activities.id, existing.id))
    .get()
  if (!stored || stored.revision >= next.modelRevision) return null
  const delta = digestByteLength(next.digestJson) - digestByteLength(existing.digestJson)
  await reserveDigestDelta(c.env.DB, userId, delta, databaseSoftLimitBytes(c.env))
  // The reservation is undone unless the digest was replaced, including when the update itself fails.
  let replaced = false
  try {
    const updated = await db
      .update(activities)
      .set({ digestJson: next.digestJson, digestVersion: next.digestVersion, name: next.name })
      .where(
        and(
          eq(activities.id, existing.id),
          eq(activities.userId, userId),
          eq(activities.fileHash, next.fileHash),
          // Only the exact digest that the reservation was sized against is replaced.
          eq(activities.digestJson, existing.digestJson),
          sql`coalesce(json_extract(digest_json, '$.modelRevision'), 1) < ${next.modelRevision}`,
        ),
      )
      .run()
    replaced = updated.meta.changes === 1
    if (!replaced) return null
    // The write may have grown the database, so the size the create guard reads is recorded.
    await recordDatabaseSize(c.env.DB, deps.now(), updated.meta.size_after)
    return {
      ...existing,
      digestJson: next.digestJson,
      digestVersion: next.digestVersion,
      name: next.name,
    }
  } finally {
    if (!replaced) {
      await c.env.DB.prepare('UPDATE users SET digest_bytes = digest_bytes - ? WHERE id = ?')
        .bind(delta, userId)
        .run()
    }
  }
}

/** A matching create answers with the activity, after upgrading it if the model is newer. */
async function upgradeExisting(
  c: Context<AppEnv>,
  userId: string,
  existing: ActivityRow,
  input: CreateInput,
): Promise<Response> {
  if (existing.fileHash !== input.fileHash) {
    throw new HttpError(409, 'activity_conflict', CONFLICTING_FILE_MESSAGE)
  }
  // A matching source file can be re-digested after a model change. The update only applies
  // while the stored revision is older, so simultaneous retries cannot downgrade the digest.
  const upgraded = await upgradeDigest(c, userId, existing, {
    digestJson: input.digestJson,
    digestVersion: input.digest.version,
    name: input.digest.name,
    modelRevision: input.digest.modelRevision,
    fileHash: input.fileHash,
  })
  if (upgraded) return c.json(toRecordHolding(upgraded, input.digest), 200)

  const latest = await findExisting(c.var.db, userId, input.dedupeKey)
  if (!latest) throw new HttpError(404, 'not_found', 'Activity not found')
  if (latest.fileHash !== input.fileHash) {
    throw new HttpError(409, 'activity_conflict', CONFLICTING_FILE_MESSAGE)
  }
  return c.json(toRecordHolding(latest, input.digest), 200)
}

/** A rebuild names the exact activity it came from, and never inserts one deleted elsewhere. */
async function replaceExact(
  c: Context<AppEnv>,
  userId: string,
  replace: string,
  input: CreateInput,
): Promise<Response> {
  const target = await findOwnedActivity(c.var.db, userId, replace)
  if (target.dedupeKey !== input.dedupeKey) {
    throw new HttpError(
      409,
      'activity_conflict',
      'This activity starts at a different time from the one being replaced',
    )
  }
  return upgradeExisting(c, userId, target, input)
}

/**
 * One D1 batch: the row and its counters move together, and only if the insert is admitted. The
 * result carries the inserted row, or no row when the insert was refused or another request wrote
 * the same activity first.
 */
async function insertActivity(
  c: Context<AppEnv>,
  id: string,
  userId: string,
  input: CreateInput,
): Promise<D1Result<ActivityRow>> {
  const { deps } = c.var
  const { dedupeKey, digest, digestJson, digestBytes, fileName, fileHash } = input
  const [inserted] = await c.env.DB.batch<ActivityRow>([
    c.env.DB.prepare(
      `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
          digest_json, file_name, file_hash, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE (SELECT activity_count FROM users WHERE id = ?) < ?
         AND (SELECT digest_bytes FROM users WHERE id = ?) + ? <= ?
         AND coalesce((SELECT d1_size_bytes FROM r2_storage_budget WHERE id = 1), 0) <= ?
         AND EXISTS (SELECT 1 FROM users WHERE id = ? AND deleting_at IS NULL)
       ON CONFLICT(user_id, dedupe_key) DO NOTHING
       RETURNING ${ACTIVITY_COLUMNS}`,
    ).bind(
      id,
      userId,
      dedupeKey,
      digest.sport,
      digest.startMs,
      digest.name,
      digest.version,
      digestJson,
      fileName,
      fileHash,
      deps.now(),
      userId,
      MAX_ACTIVITIES_PER_USER,
      userId,
      digestBytes,
      MAX_DIGEST_BYTES_PER_USER,
      databaseSoftLimitBytes(c.env),
      userId,
    ),
    c.env.DB.prepare(
      `UPDATE users SET activity_count = activity_count + 1, digest_bytes = digest_bytes + ?
       WHERE id = ? AND EXISTS (SELECT 1 FROM activities WHERE id = ? AND user_id = ?)`,
    ).bind(digestBytes, userId, id, userId),
  ])
  return must(inserted, 'insert result')
}

/** Inserts a new activity, refunding its daily unit when a concurrent request wrote it first. */
async function insertNew(
  c: Context<AppEnv>,
  userId: string,
  input: CreateInput,
): Promise<Response> {
  const { db, deps } = c.var
  // What the account cannot hold is refused before a daily unit is taken, so a refused create
  // writes nothing. The insert holds the same limits, for requests that race this check.
  const refusal = createRefusal(
    await accountState(c.env.DB, userId),
    input.digestBytes,
    databaseSoftLimitBytes(c.env),
  )
  if (refusal) throw refusal
  // Only a request that will insert a new row takes a daily create unit.
  const charge = await chargeDaily(c.env.DB, userId, 'activityCreate', deps.now())
  const id = deps.randomUUID()
  const inserted = await insertActivity(c, id, userId, input)
  const row = inserted.results[0]
  if (row) {
    // Only a create that wrote its row updates the size the guard reads.
    await recordDatabaseSize(c.env.DB, deps.now(), inserted.meta.size_after)
    return c.json(toRecord(row), 201)
  }

  await charge.refund()
  const existing = await findExisting(db, userId, input.dedupeKey)
  if (existing) return upgradeExisting(c, userId, existing, input)
  // Another request filled the account after the check above.
  throw (
    createRefusal(
      await accountState(c.env.DB, userId),
      input.digestBytes,
      databaseSoftLimitBytes(c.env),
    ) ?? activityQuota()
  )
}

export const createRoutes = new Hono<AppEnv>()

createRoutes.post(
  '/',
  limitBody(MAX_CREATE_BODY_BYTES),
  requireUser,
  zValidator('query', createQuery, (result, c) => {
    if (!result.success) return c.json(invalidRequest(result.error), 400)
  }),
  async (c) => {
    const userId = currentUser(c).id
    const { replace } = c.req.valid('query')

    const body = await readJsonBody(c.req.raw)
    requireCurrentRevision(body)
    const parsed = ActivityCreateSchema.safeParse(body)
    if (!parsed.success) return c.json(invalidRequest(parsed.error), 400)
    const input = createInput(parsed.data)

    if (replace !== undefined) return replaceExact(c, userId, replace, input)
    const existing = await findExisting(c.var.db, userId, input.dedupeKey)
    if (existing) return upgradeExisting(c, userId, existing, input)
    return insertNew(c, userId, input)
  },
)
