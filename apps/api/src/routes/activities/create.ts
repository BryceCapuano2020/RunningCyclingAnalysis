import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  ActivityCreateSchema,
  DATABASE_SOFT_LIMIT_BYTES,
  MAX_ACTIVITIES_PER_USER,
  MAX_DIGEST_BYTES_PER_USER,
  MAX_DIGEST_BYTES,
} from '@rca/contract'
import type { AppEnv, Db } from '../../env.ts'
import { HttpError } from '../../errors.ts'
import { currentUser, requireUser } from '../../middleware.ts'
import { invalidRequest, limitBody, readBody } from '../../http.ts'
import { chargeDaily } from '../../budget.ts'
import { recordDatabaseSize } from '../../storage.ts'
import { activities } from '../../db/schema.ts'
import { dedupeKeyFor, findOwnedActivity, toRecord, type ActivityRow } from './shared.ts'

/** The digest limit applies to its JSON; the envelope (name, hash) gets this much headroom. */
const MAX_CREATE_BODY_BYTES = MAX_DIGEST_BYTES + 16 * 1024

const DATABASE_FULL_MESSAGE = 'Activities cannot be saved while the database is full'

const DIGEST_QUOTA_MESSAGE = `You can store at most ${MAX_DIGEST_BYTES_PER_USER / (1024 * 1024)} MiB of activity digests`

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

interface AccountState {
  deletingAt: number | null
  digestBytes: number
  databaseBytes: number
}

/** The account counters, read after a write was refused to say why. */
async function accountState(db: D1Database, userId: string): Promise<AccountState> {
  const row = await db
    .prepare(
      `SELECT deleting_at AS deletingAt, digest_bytes AS digestBytes,
         coalesce((SELECT d1_size_bytes FROM r2_storage_budget WHERE id = 1), 0) AS databaseBytes
       FROM users WHERE id = ?`,
    )
    .bind(userId)
    .first<AccountState>()
  return row ?? { deletingAt: null, digestBytes: 0, databaseBytes: 0 }
}

/** The reason the insert wrote nothing, read back once the insert has been refused. */
async function createRefusal(
  db: D1Database,
  userId: string,
  digestBytes: number,
): Promise<HttpError> {
  const state = await accountState(db, userId)
  if (state.databaseBytes > DATABASE_SOFT_LIMIT_BYTES) {
    return new HttpError(503, 'database_full', DATABASE_FULL_MESSAGE)
  }
  if (state.digestBytes + digestBytes > MAX_DIGEST_BYTES_PER_USER) {
    return new HttpError(403, 'digest_quota', DIGEST_QUOTA_MESSAGE)
  }
  return new HttpError(
    403,
    'activity_quota',
    `You can store at most ${MAX_ACTIVITIES_PER_USER} activities`,
  )
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
async function reserveDigestDelta(db: D1Database, userId: string, delta: number): Promise<void> {
  // A shrinking digest is always admitted, even by an account already above the cap, and so is one
  // that does not grow while the database is over its soft limit.
  const reserved = await db
    .prepare(
      `UPDATE users SET digest_bytes = digest_bytes + ?1
       WHERE id = ?2 AND deleting_at IS NULL AND (?1 <= 0 OR digest_bytes + ?1 <= ?3)
         AND (?1 <= 0 OR coalesce((SELECT d1_size_bytes FROM r2_storage_budget WHERE id = 1), 0) <= ?4)
       RETURNING id`,
    )
    .bind(delta, userId, MAX_DIGEST_BYTES_PER_USER, DATABASE_SOFT_LIMIT_BYTES)
    .first()
  if (reserved) return
  const state = await accountState(db, userId)
  if (state.deletingAt !== null) {
    throw new HttpError(409, 'account_deleting', 'This account is being deleted')
  }
  if (delta > 0 && state.databaseBytes > DATABASE_SOFT_LIMIT_BYTES) {
    throw new HttpError(503, 'database_full', DATABASE_FULL_MESSAGE)
  }
  throw new HttpError(403, 'digest_quota', DIGEST_QUOTA_MESSAGE)
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
  await reserveDigestDelta(c.env.DB, userId, delta)
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
  if (upgraded) return c.json(toRecord(upgraded), 200)

  const latest = await findExisting(c.var.db, userId, input.dedupeKey)
  if (!latest) throw new HttpError(404, 'not_found', 'Activity not found')
  if (latest.fileHash !== input.fileHash) {
    throw new HttpError(409, 'activity_conflict', CONFLICTING_FILE_MESSAGE)
  }
  return c.json(toRecord(latest), 200)
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

/** One D1 batch: the row and its counters move together, and only if the insert is admitted. */
async function insertActivity(
  c: Context<AppEnv>,
  id: string,
  userId: string,
  input: CreateInput,
): Promise<D1Result | undefined> {
  const { deps } = c.var
  const { dedupeKey, digest, digestJson, digestBytes, fileName, fileHash } = input
  const [inserted] = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
          digest_json, file_name, file_hash, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE (SELECT activity_count FROM users WHERE id = ?) < ?
         AND (SELECT digest_bytes FROM users WHERE id = ?) + ? <= ?
         AND coalesce((SELECT d1_size_bytes FROM r2_storage_budget WHERE id = 1), 0) <= ?
         AND EXISTS (SELECT 1 FROM users WHERE id = ? AND deleting_at IS NULL)
       ON CONFLICT(user_id, dedupe_key) DO NOTHING`,
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
      DATABASE_SOFT_LIMIT_BYTES,
      userId,
    ),
    c.env.DB.prepare(
      `UPDATE users SET activity_count = activity_count + 1, digest_bytes = digest_bytes + ?
       WHERE id = ? AND EXISTS (SELECT 1 FROM activities WHERE id = ? AND user_id = ?)`,
    ).bind(digestBytes, userId, id, userId),
  ])
  return inserted
}

/** Inserts a new activity, refunding its daily unit when a concurrent request wrote it first. */
async function insertNew(
  c: Context<AppEnv>,
  userId: string,
  input: CreateInput,
): Promise<Response> {
  const { db, deps } = c.var
  // Only a request that will insert a new row takes a daily create unit.
  const charge = await chargeDaily(c.env.DB, userId, 'activityCreate', deps.now())
  const id = deps.randomUUID()
  const inserted = await insertActivity(c, id, userId, input)
  const afterInsert = await findExisting(db, userId, input.dedupeKey)
  if (afterInsert?.id === id) {
    // Only a create that wrote its row updates the size the guard reads.
    if (inserted) await recordDatabaseSize(c.env.DB, deps.now(), inserted.meta.size_after)
    return c.json(toRecord(afterInsert), 201)
  }

  await charge.refund()
  if (afterInsert) return upgradeExisting(c, userId, afterInsert, input)
  throw await createRefusal(c.env.DB, userId, input.digestBytes)
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

    const parsed = ActivityCreateSchema.safeParse(await readJsonBody(c.req.raw))
    if (!parsed.success) return c.json(invalidRequest(parsed.error), 400)
    const input = createInput(parsed.data)

    if (replace !== undefined) return replaceExact(c, userId, replace, input)
    const existing = await findExisting(c.var.db, userId, input.dedupeKey)
    if (existing) return upgradeExisting(c, userId, existing, input)
    return insertNew(c, userId, input)
  },
)
