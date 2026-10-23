import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, gte, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import {
  ActivityCreateSchema,
  DAILY_UPLOAD_BYTES,
  DATABASE_SOFT_LIMIT_BYTES,
  DEFAULT_PAGE_SIZE,
  MAX_ACTIVITIES_PER_USER,
  MAX_DIGEST_BYTES_PER_USER,
  MAX_DIGEST_BYTES,
  MAX_FILE_BYTES,
  MAX_PAGE_SIZE,
  MAX_PAGE_DIGEST_BYTES,
  MAX_STORED_BYTES_PER_USER,
  StoredActivityDigestSchema,
  type ActivityPage,
  type ActivityRecord,
} from '@rca/contract'
import type { Sport } from '@rca/core/types'
import type { AppEnv, Db } from '../env.ts'
import { apiError, HttpError } from '../errors.ts'
import { ensureProfile } from '../auth/accounts.ts'
import { currentUser, requireUser, sameOriginReadGuard } from '../middleware.ts'
import {
  contentDisposition,
  declaredLength,
  invalidRequest,
  limitBody,
  readBody,
  readExactBody,
} from '../http.ts'
import { decodeCursor, encodeCursor, type Cursor } from '../cursor.ts'
import {
  chargeDaily,
  acquireUploadSlot,
  nextUtcMidnight,
  releaseUploadSlot,
  utcDay,
  type DailyCharge,
} from '../budget.ts'
import {
  activityFileKey,
  checkR2PutBudget,
  getOriginalFile,
  recordDatabaseSize,
  reserveR2Put,
} from '../storage.ts'
import { activities } from '../db/schema.ts'
import { must, sha256Hex } from '../util.ts'

/** The digest limit applies to its JSON; the envelope (name, hash) gets this much headroom. */
const MAX_CREATE_BODY_BYTES = MAX_DIGEST_BYTES + 16 * 1024

/**
 * Database pages one listing request may scan. Unreadable rows fill no page, so without this cap a
 * long run of them would take an unbounded number of D1 queries in one request.
 */
const MAX_SCAN_PAGES = 8

const DATABASE_FULL_MESSAGE = 'Activities cannot be saved while the database is full'

const listQuery = z.object({
  /** Epoch ms. Returns records created at or after this time. */
  since: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  /** Opaque, from a previous page's nextCursor. */
  cursor: z.string().max(256).optional(),
})

const createQuery = z.object({
  /** Updates this exact activity, owned by the caller, instead of inserting one. */
  replace: z.string().min(1).max(64).optional(),
})

type ActivityRow = typeof activities.$inferSelect

/** Activities created from the same sport in the same second are the same activity. */
export function dedupeKeyFor(sport: Sport, startMs: number): string {
  return `${sport}-${Math.round(startMs / 1000)}`
}

function toRecord(
  row: ActivityRow,
  digest: ActivityRecord['digest'] = StoredActivityDigestSchema.parse(JSON.parse(row.digestJson)),
): ActivityRecord {
  return {
    id: row.id,
    digest,
    fileName: row.fileName,
    hasFile: row.fileKey !== null,
    // A pending reservation counts toward quota internally, but is not a stored file yet.
    fileSize: row.fileKey === null ? null : row.fileSize,
    createdAt: row.createdAt,
  }
}

/** A stored digest's size: UTF-8 bytes, as SQLite's length(CAST(digest_json AS BLOB)) counts them. */
function digestByteLength(digestJson: string): number {
  return new TextEncoder().encode(digestJson).byteLength
}

const DIGEST_QUOTA_MESSAGE = `You can store at most ${MAX_DIGEST_BYTES_PER_USER / (1024 * 1024)} MiB of activity digests`

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
  next: {
    digestJson: string
    digestVersion: number
    name: string
    modelRevision: number
    fileHash: string
  },
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
  // A shrinking digest is always admitted, even by an account already above the cap, and so is one
  // that does not grow while the database is over its soft limit.
  const reserved = await c.env.DB.prepare(
    `UPDATE users SET digest_bytes = digest_bytes + ?1
     WHERE id = ?2 AND deleting_at IS NULL AND (?1 <= 0 OR digest_bytes + ?1 <= ?3)
       AND (?1 <= 0 OR coalesce((SELECT d1_size_bytes FROM r2_storage_budget WHERE id = 1), 0) <= ?4)
     RETURNING id`,
  )
    .bind(delta, userId, MAX_DIGEST_BYTES_PER_USER, DATABASE_SOFT_LIMIT_BYTES)
    .first()
  if (!reserved) {
    const state = await accountState(c.env.DB, userId)
    if (state.deletingAt !== null) {
      throw new HttpError(409, 'account_deleting', 'This account is being deleted')
    }
    if (delta > 0 && state.databaseBytes > DATABASE_SOFT_LIMIT_BYTES) {
      throw new HttpError(503, 'database_full', DATABASE_FULL_MESSAGE)
    }
    throw new HttpError(403, 'digest_quota', DIGEST_QUOTA_MESSAGE)
  }
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

/**
 * Spends the cursor the server issued last. It is accepted once: the update clears it in the same
 * statement that matches it, so a replayed or forged cursor finds nothing to spend.
 */
async function spendListCursor(db: D1Database, userId: string, cursor: string): Promise<boolean> {
  const result = await db
    .prepare('UPDATE users SET list_cursor = NULL WHERE id = ? AND list_cursor = ?')
    .bind(userId, cursor)
    .run()
  return result.meta.changes === 1
}

function logUnreadable(activityId: string, path: string): void {
  console.warn(JSON.stringify({ event: 'activity_digest_unreadable', activityId, path }))
}

/**
 * The row's digest if it still validates. A stored row that does not is logged by id and the first
 * failing path, never by content, and the caller skips it.
 */
function readableDigest(row: ActivityRow): ActivityRecord['digest'] | undefined {
  let json: unknown
  try {
    json = JSON.parse(row.digestJson)
  } catch {
    logUnreadable(row.id, '')
    return undefined
  }
  const parsed = StoredActivityDigestSchema.safeParse(json)
  if (parsed.success) return parsed.data
  logUnreadable(row.id, parsed.error.issues[0]?.path.join('.') ?? '')
  return undefined
}

/** Looks up an activity owned by the user. Other users' activities read as not found. */
async function findOwnedActivity(db: Db, userId: string, id: string): Promise<ActivityRow> {
  const row = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, id), eq(activities.userId, userId)))
    .get()
  if (!row) throw new HttpError(404, 'not_found', 'Activity not found')
  return row
}

export const activityRoutes = new Hono<AppEnv>()

activityRoutes.get(
  '/',
  sameOriginReadGuard,
  requireUser,
  zValidator('query', listQuery, (result, c) => {
    if (!result.success) return c.json(invalidRequest(result.error), 400)
  }),
  async (c) => {
    const { db, deps } = c.var
    const query = c.req.valid('query')
    const userId = currentUser(c).id
    // A malformed cursor is refused before any read unit is taken.
    const resumeAfter = query.cursor === undefined ? undefined : decodeCursor(query.cursor)
    // Only the cursor the server issued last continues for free. Any other request is a fresh read.
    const continuing =
      query.cursor !== undefined && (await spendListCursor(c.env.DB, userId, query.cursor))
    if (!continuing) await chargeDaily(c.env.DB, userId, 'read', deps.now())
    const limit = query.limit ?? DEFAULT_PAGE_SIZE
    const filters: (SQL | undefined)[] = [eq(activities.userId, userId)]
    if (query.since !== undefined) filters.push(gte(activities.createdAt, query.since))
    let scanAfter = resumeAfter
    // The last row examined, readable or not, so a page of skipped rows still moves the cursor on.
    let examinedTo: Cursor | undefined
    const pageItems: ActivityRecord[] = []
    let pageDigestBytes = 0
    let unreadable = 0
    let hasMore = false
    const candidatePageSize = limit + 1

    // Digest JSON is capped at 256 KiB per activity. Scan only small metadata first, then fetch
    // the rows that fit the page byte budget; a large library cannot create a huge JSON response.
    for (let scans = 0; pageItems.length < limit; scans += 1) {
      if (scans === MAX_SCAN_PAGES) {
        // The rows examined so far are behind the cursor, so the next request resumes after them.
        hasMore = true
        break
      }
      const pageFilters = [...filters]
      if (scanAfter !== undefined) {
        const after = scanAfter
        pageFilters.push(
          or(
            lt(activities.createdAt, after.createdAt),
            and(eq(activities.createdAt, after.createdAt), lt(activities.id, after.id)),
          ),
        )
      }
      const candidates = await db
        .select({
          id: activities.id,
          createdAt: activities.createdAt,
          digestBytes: sql<number>`length(CAST(${activities.digestJson} AS BLOB))`,
        })
        .from(activities)
        .where(and(...pageFilters))
        .orderBy(desc(activities.createdAt), desc(activities.id))
        .limit(candidatePageSize)
      if (candidates.length === 0) break

      const selected: typeof candidates = []
      let selectedBytes = pageDigestBytes
      for (const candidate of candidates) {
        if (pageItems.length + selected.length >= limit) break
        if (selectedBytes + candidate.digestBytes > MAX_PAGE_DIGEST_BYTES) break
        selected.push(candidate)
        selectedBytes += candidate.digestBytes
      }
      if (selected.length === 0) {
        hasMore = candidates.length > 0
        break
      }

      const fetched = await db
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.userId, userId),
            inArray(
              activities.id,
              selected.map((r) => r.id),
            ),
          ),
        )
        .all()
      const rowsById = new Map(fetched.map((row) => [row.id, row]))
      for (const candidate of selected) {
        const row = rowsById.get(candidate.id)
        if (row === undefined) continue
        const digest = readableDigest(row)
        if (digest === undefined) {
          unreadable += 1
          continue
        }
        pageItems.push(toRecord(row, digest))
        pageDigestBytes += candidate.digestBytes
      }

      const lastExamined = selected.at(-1)
      if (!lastExamined) break
      scanAfter = { createdAt: lastExamined.createdAt, id: lastExamined.id }
      examinedTo = scanAfter
      if (pageItems.length >= limit) {
        hasMore = selected.length < candidates.length || candidates.length === candidatePageSize
        break
      }
      if (selected.length < candidates.length) {
        // Some selected rows may have disappeared between the metadata and fetch queries. Try
        // the unscanned row again if deleted rows left enough room in this response.
        if (pageDigestBytes >= MAX_PAGE_DIGEST_BYTES) {
          hasMore = true
          break
        }
        continue
      }
      if (candidates.length < candidatePageSize) break
    }
    const nextCursor = hasMore && examinedTo ? encodeCursor(examinedTo) : null
    if (nextCursor !== null) {
      await c.env.DB.prepare('UPDATE users SET list_cursor = ? WHERE id = ?')
        .bind(nextCursor, userId)
        .run()
    }
    const page: ActivityPage = {
      items: pageItems,
      nextCursor,
      ...(unreadable > 0 ? { unreadable } : {}),
    }
    return c.json(page, 200)
  },
)

activityRoutes.post(
  '/',
  limitBody(MAX_CREATE_BODY_BYTES),
  requireUser,
  zValidator('query', createQuery, (result, c) => {
    if (!result.success) return c.json(invalidRequest(result.error), 400)
  }),
  async (c) => {
    const { db, deps } = c.var
    const userId = currentUser(c).id
    const { replace } = c.req.valid('query')
    const body = await readBody(c.req.raw, MAX_CREATE_BODY_BYTES)

    let json: unknown
    try {
      json = JSON.parse(new TextDecoder().decode(body))
    } catch {
      throw new HttpError(400, 'invalid_json', 'Body is not valid JSON')
    }
    const parsed = ActivityCreateSchema.safeParse(json)
    if (!parsed.success) return c.json(invalidRequest(parsed.error), 400)

    const { digest, fileName, fileHash } = parsed.data
    const digestJson = JSON.stringify(digest)
    const digestBytes = digestByteLength(digestJson)
    if (digestBytes > MAX_DIGEST_BYTES) {
      throw new HttpError(413, 'digest_too_large', 'Activity digest is larger than 256 KB')
    }

    const dedupeKey = dedupeKeyFor(digest.sport, digest.startMs)
    const selectExisting = () =>
      db
        .select()
        .from(activities)
        .where(and(eq(activities.userId, userId), eq(activities.dedupeKey, dedupeKey)))
        .get()

    const respondForExisting = async (existing: ActivityRow): Promise<Response> => {
      if (existing.fileHash !== fileHash) {
        throw new HttpError(
          409,
          'activity_conflict',
          'This activity already exists with different original file contents',
        )
      }

      // A matching source file can be re-digested after a model change. The update only applies
      // while the stored revision is older, so simultaneous retries cannot downgrade the digest.
      const upgraded = await upgradeDigest(c, userId, existing, {
        digestJson,
        digestVersion: digest.version,
        name: digest.name,
        modelRevision: digest.modelRevision,
        fileHash,
      })
      if (upgraded) return c.json(toRecord(upgraded), 200)

      const latest = await selectExisting()
      if (!latest) throw new HttpError(404, 'not_found', 'Activity not found')
      if (latest.fileHash !== fileHash) {
        throw new HttpError(
          409,
          'activity_conflict',
          'This activity already exists with different original file contents',
        )
      }
      return c.json(toRecord(latest), 200)
    }

    if (replace !== undefined) {
      // A rebuild names the exact activity it came from. It never inserts, so an activity deleted
      // in another tab is not written back.
      const target = await findOwnedActivity(db, userId, replace)
      if (target.dedupeKey !== dedupeKey) {
        throw new HttpError(
          409,
          'activity_conflict',
          'This activity starts at a different time from the one being replaced',
        )
      }
      return respondForExisting(target)
    }

    const existing = await selectExisting()
    if (existing) return respondForExisting(existing)

    // Only a request that will insert a new row takes a daily create unit.
    const charge = await chargeDaily(c.env.DB, userId, 'activityCreate', deps.now())
    const id = deps.randomUUID()
    // One D1 transaction. The insert is admitted only while the activity count is under its cap,
    // the digest bytes fit the per-user quota, the database is under its soft limit, and the
    // account is not being deleted. The counters move only if that insert happened.
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
    const afterInsert = await selectExisting()
    if (afterInsert?.id === id) {
      // Only a create that wrote its row updates the size the guard reads.
      if (inserted) await recordDatabaseSize(c.env.DB, deps.now(), inserted.meta.size_after)
      return c.json(toRecord(afterInsert), 201)
    }

    await charge.refund()
    if (afterInsert) return respondForExisting(afterInsert)
    throw await createRefusal(c.env.DB, userId, digestBytes)
  },
)

/**
 * Takes `bytes` from the user's daily upload allowance in one atomic upsert, which succeeds only
 * while the day's total stays within DAILY_UPLOAD_BYTES. Same pattern as chargeDaily in budget.ts.
 */
async function chargeUploadBytes(
  db: D1Database,
  userId: string,
  bytes: number,
  now: number,
): Promise<DailyCharge> {
  const day = utcDay(now)
  const admitted = await db
    .prepare(
      `INSERT INTO daily_budget (user_id, day, action, used)
       SELECT ?1, ?2, 'uploadBytes', ?3 WHERE ?3 <= ?4
       ON CONFLICT(user_id, day, action) DO UPDATE SET used = used + ?3
       WHERE used + ?3 <= ?4
       RETURNING used`,
    )
    .bind(userId, day, bytes, DAILY_UPLOAD_BYTES)
    .first<{ used: number }>()
  if (!admitted) {
    const seconds = Math.max(1, Math.ceil((nextUtcMidnight(now) - now) / 1000))
    throw new HttpError(
      429,
      'daily_limit',
      'You have reached your daily upload limit. Try again after midnight UTC',
      { retryAfter: seconds },
    )
  }
  return {
    refund: async () => {
      await db
        .prepare(
          `UPDATE daily_budget SET used = used - ?
           WHERE user_id = ? AND day = ? AND action = 'uploadBytes' AND used >= ?`,
        )
        .bind(bytes, userId, day, bytes)
        .run()
    },
  }
}

/**
 * Stores the original file for an activity while the caller holds an upload slot. The declared
 * length is checked before the body is read: the R2 ledgers, the daily allowances and the stored
 * bytes are charged first, and only then is the body read and hashed. A refusal before the body
 * is read gives everything back, and so does a refusal of the deployment's R2 ledger. Once reading
 * the body has started, its daily charges stand, even when the read or the hash then fails. A
 * failed R2 write keeps the reservation so a same-activity retry can finish. `slot` is this
 * request's upload slot, and it is the reservation token: only this request gives the reservation
 * back.
 */
async function storeOriginalFile(
  c: Context<AppEnv>,
  row: ActivityRow,
  userId: string,
  declared: number,
  slot: string,
): Promise<Response> {
  const { db, deps } = c.var
  const bucket = c.env.FILES
  if (!bucket) {
    throw new HttpError(
      503,
      'file_storage_unavailable',
      'Original-file storage is not available in this deployment',
    )
  }

  await checkR2PutBudget(c.env.DB, deps.now(), declared)
  const charge: DailyCharge = await chargeDaily(c.env.DB, userId, 'fileUpload', deps.now())
  const bytesCharge = await chargeUploadBytes(c.env.DB, userId, declared, deps.now()).catch(
    async (error: unknown) => {
      await charge.refund()
      throw error
    },
  )
  const refundCharges = async () => {
    await charge.refund()
    await bytesCharge.refund()
  }
  const reservedSize = declared
  const stored = await db
    .update(activities)
    .set({
      fileSize: reservedSize,
      // A reservation that a live upload holds keeps its token, so only that upload can release it.
      fileReservationToken: sql`CASE WHEN ${activities.fileReservationToken} IN (
          SELECT slot_id FROM upload_slots WHERE user_id = ${userId} AND expires_at > ${deps.now()}
        ) THEN ${activities.fileReservationToken} ELSE ${slot} END`,
    })
    .where(
      and(
        eq(activities.id, row.id),
        eq(activities.userId, userId),
        // Reserve the bytes in the activity row with one atomic D1 write. Concurrent uploads
        // therefore see this reservation when checking the same user's remaining storage.
        sql`EXISTS (SELECT 1 FROM users WHERE id = ${userId} AND deleting_at IS NULL)`,
        sql`(SELECT coalesce(sum(file_size), 0) FROM activities WHERE user_id = ${userId})
          - coalesce(file_size, 0) <= ${MAX_STORED_BYTES_PER_USER - reservedSize}`,
      ),
    )
    .returning()
    .get()
  if (!stored) {
    await refundCharges()
    // A missing row means a delete won the race; a present row means the reservation exceeded
    // the user's quota, or the account is being deleted.
    const stillOwned = await db
      .select({ id: activities.id })
      .from(activities)
      .where(and(eq(activities.id, row.id), eq(activities.userId, userId)))
      .get()
    if (!stillOwned) throw new HttpError(404, 'not_found', 'Activity not found')
    const deleting = await c.env.DB.prepare(
      'SELECT 1 AS found FROM users WHERE id = ? AND deleting_at IS NOT NULL',
    )
      .bind(userId)
      .first()
    if (deleting) throw new HttpError(409, 'account_deleting', 'This account is being deleted')
    throw new HttpError(403, 'storage_quota', 'Storing this file would exceed your storage limit')
  }

  const key = activityFileKey(userId, row.id)
  // The size is restored only by the request that holds the reservation, and only while the row
  // still has the file key this request started with. A concurrent upload that completed in the
  // meantime keeps the size it stored.
  const releaseReservation = async () => {
    await db
      .update(activities)
      .set({ fileSize: row.fileSize, fileReservationToken: null })
      .where(
        and(
          eq(activities.id, row.id),
          eq(activities.userId, userId),
          eq(activities.fileReservationToken, slot),
          row.fileKey === null ? isNull(activities.fileKey) : eq(activities.fileKey, row.fileKey),
        ),
      )
  }
  let body: Uint8Array
  try {
    body = await readExactBody(c.req.raw, declared, MAX_FILE_BYTES)
  } catch (error) {
    // The body was being read, so the daily charges stand: an upload that was consumed is not free.
    await releaseReservation()
    throw error
  }
  if ((await sha256Hex(body)) !== row.fileHash) {
    await releaseReservation()
    throw new HttpError(422, 'hash_mismatch', 'File does not match the digest it was uploaded for')
  }
  try {
    await reserveR2Put(c.env.DB, deps.now, reservedSize)
  } catch (error) {
    // Refused before any R2 call, for the deployment's own ledger rather than the body: nothing was
    // stored, so every daily unit goes back.
    await releaseReservation()
    await refundCharges()
    throw error
  }
  // Keep a reservation after an R2 failure: a same-activity retry has the same hash and size and
  // reuses it. Deleting the activity, disabling file retention or deleting the account releases it.
  await bucket.put(key, body, {
    httpMetadata: { contentType: 'application/octet-stream' },
    storageClass: 'Standard',
  })

  // The row must still exist, with retention on and the account not deleting. Otherwise the object
  // this request just wrote is removed here, so nothing is left behind.
  const updated = await db
    .update(activities)
    .set({ fileKey: key, fileSize: reservedSize, fileReservationToken: null })
    .where(
      and(
        eq(activities.id, row.id),
        eq(activities.userId, userId),
        sql`EXISTS (SELECT 1 FROM profiles WHERE user_id = ${userId} AND keep_files = 1)`,
        sql`EXISTS (SELECT 1 FROM users WHERE id = ${userId} AND deleting_at IS NULL)`,
      ),
    )
    .returning()
    .get()
  if (!updated) {
    await bucket.delete(key)
    const stillOwned = await db
      .select({ id: activities.id })
      .from(activities)
      .where(and(eq(activities.id, row.id), eq(activities.userId, userId)))
      .get()
    if (!stillOwned) throw new HttpError(404, 'not_found', 'Activity not found')

    await db
      .update(activities)
      .set({ fileKey: null, fileSize: null, fileReservationToken: null })
      .where(and(eq(activities.id, row.id), eq(activities.userId, userId)))
    throw new HttpError(409, 'files_disabled', 'Original files are turned off in your profile')
  }
  return c.json(toRecord(must(updated, 'activity')), 200)
}

activityRoutes.put('/:id/file', requireUser, async (c) => {
  const { db, deps } = c.var
  const userId = currentUser(c).id
  const row = await findOwnedActivity(db, userId, c.req.param('id'))

  // Do not reserve quota or create a default profile in deployments without file storage.
  if (!c.env.FILES) {
    throw new HttpError(
      503,
      'file_storage_unavailable',
      'Original-file storage is not available in this deployment',
    )
  }

  // The upload must declare its length, so the body is read into one buffer of that size.
  const declared = declaredLength(c.req.raw)
  if (declared === undefined) {
    return c.json(apiError('length_required', 'Send the file with a Content-Length header'), 411)
  }
  if (declared > MAX_FILE_BYTES) {
    throw new HttpError(413, 'payload_too_large', `Body is larger than ${MAX_FILE_BYTES} bytes`)
  }
  if (declared === 0) throw new HttpError(400, 'empty_file', 'File body is empty')

  const profile = await ensureProfile(db, userId, deps.now())
  if (!profile.keepFiles) {
    throw new HttpError(409, 'files_disabled', 'Original files are turned off in your profile')
  }

  // A stored file was verified against the activity's hash when it was written. A repeat of the
  // same length gets the stored record back, without reading the body, taking a slot or charging
  // any budget. Such a repeat could otherwise use up the deployment's R2 write ledgers.
  if (row.fileKey !== null && row.fileSize === declared) {
    void c.req.raw.body?.cancel().catch(() => undefined)
    return c.json(toRecord(row), 200)
  }

  // The slot is taken before the body is read, so at most two bodies per user are in memory.
  const slot = deps.randomUUID()
  await acquireUploadSlot(c.env.DB, userId, slot, deps.now())
  try {
    return await storeOriginalFile(c, row, userId, declared, slot)
  } finally {
    await releaseUploadSlot(c.env.DB, userId, slot)
  }
})

activityRoutes.get('/:id/file', sameOriginReadGuard, requireUser, async (c) => {
  const { db, deps } = c.var
  const userId = currentUser(c).id
  const row = await findOwnedActivity(db, userId, c.req.param('id'))
  if (!row.fileKey) throw new HttpError(404, 'no_file', 'This activity has no stored file')
  if (!c.env.FILES) {
    throw new HttpError(
      503,
      'file_storage_unavailable',
      'Original-file storage is not available in this deployment',
    )
  }

  const charge = await chargeDaily(c.env.DB, userId, 'fileDownload', deps.now())
  let object: R2ObjectBody | null
  try {
    object = await getOriginalFile(c.env.DB, c.env.FILES, row.fileKey, deps.now)
  } catch (error) {
    await charge.refund()
    throw error
  }
  if (!object) throw new HttpError(404, 'no_file', 'The stored file is missing')

  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'content-length': String(object.size),
      'content-disposition': contentDisposition(row.fileName),
      'cache-control': 'private, no-store',
    },
  })
})

activityRoutes.delete('/:id', requireUser, async (c) => {
  const { db, deps } = c.var
  const userId = currentUser(c).id
  const row = await findOwnedActivity(db, userId, c.req.param('id'))
  if (!c.env.FILES && (row.fileKey !== null || row.fileSize !== null)) {
    throw new HttpError(
      503,
      'file_storage_unavailable',
      'Original files must be available before this activity can be deleted',
    )
  }
  await chargeDaily(c.env.DB, userId, 'activityDelete', deps.now())

  // The row goes first, in the same transaction that lowers the stored counter. The object follows.
  // An upload that finishes after this sees no row and removes its own object.
  const [, removed] = await c.env.DB.batch([
    // The refund reads the stored digest size before the next statement deletes the row.
    c.env.DB.prepare(
      `UPDATE users SET activity_count = activity_count - 1,
         digest_bytes = digest_bytes - (SELECT length(CAST(digest_json AS BLOB)) FROM activities
           WHERE id = ? AND user_id = ?)
       WHERE id = ? AND EXISTS (SELECT 1 FROM activities WHERE id = ? AND user_id = ?)`,
    ).bind(row.id, userId, userId, row.id, userId),
    c.env.DB.prepare('DELETE FROM activities WHERE id = ? AND user_id = ? RETURNING file_key').bind(
      row.id,
      userId,
    ),
  ])
  const deletedRows = (removed?.results ?? []) as { file_key: string | null }[]
  if (deletedRows.length === 0) throw new HttpError(404, 'not_found', 'Activity not found')
  // The delete may bring the database back under its soft limit, so the create guard reads it.
  if (removed) await recordDatabaseSize(c.env.DB, deps.now(), removed.meta.size_after)

  if (c.env.FILES) {
    const keys = new Set([activityFileKey(userId, row.id)])
    const captured = deletedRows[0]?.file_key
    if (captured) keys.add(captured)
    try {
      await c.env.FILES.delete([...keys])
    } catch {
      // The row is gone, so the object is now unreachable. The scheduled sweep removes it after
      // its grace period; the caller's delete has succeeded.
      console.error(
        JSON.stringify({
          event: 'activity_object_left_for_sweep',
          requestId: c.res.headers.get('X-Request-ID'),
        }),
      )
    }
  }
  return c.body(null, 204)
})
