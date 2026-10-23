import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, gte, inArray, lt, or, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import {
  ActivityCreateSchema,
  ActivityDigestSchema,
  DEFAULT_PAGE_SIZE,
  MAX_ACTIVITIES_PER_USER,
  MAX_DIGEST_BYTES,
  MAX_FILE_BYTES,
  MAX_PAGE_SIZE,
  MAX_PAGE_DIGEST_BYTES,
  MAX_STORED_BYTES_PER_USER,
  type ActivityPage,
  type ActivityRecord,
} from '@rca/contract'
import type { Sport } from '@rca/core/types'
import type { AppEnv, Db } from '../env.ts'
import { HttpError } from '../errors.ts'
import { ensureProfile } from '../auth/accounts.ts'
import { currentUser, requireUser } from '../middleware.ts'
import { contentDisposition, invalidRequest, limitBody, readBody } from '../http.ts'
import { decodeCursor, encodeCursor } from '../cursor.ts'
import { chargeDaily, acquireUploadSlot, releaseUploadSlot, type DailyCharge } from '../budget.ts'
import { activityFileKey, getOriginalFile, reserveR2Put } from '../storage.ts'
import { activities } from '../db/schema.ts'
import { must, sha256Hex } from '../util.ts'

/** The digest limit applies to its JSON; the envelope (name, hash) gets this much headroom. */
const MAX_CREATE_BODY_BYTES = MAX_DIGEST_BYTES + 16 * 1024

const listQuery = z.object({
  /** Epoch ms. Returns records created at or after this time. */
  since: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  /** Opaque, from a previous page's nextCursor. */
  cursor: z.string().max(256).optional(),
})

type ActivityRow = typeof activities.$inferSelect

/** Activities created from the same sport in the same second are the same activity. */
export function dedupeKeyFor(sport: Sport, startMs: number): string {
  return `${sport}-${Math.round(startMs / 1000)}`
}

function toRecord(row: ActivityRow): ActivityRecord {
  return {
    id: row.id,
    digest: ActivityDigestSchema.parse(JSON.parse(row.digestJson)),
    fileName: row.fileName,
    hasFile: row.fileKey !== null,
    // A pending reservation counts toward quota internally, but is not a stored file yet.
    fileSize: row.fileKey === null ? null : row.fileSize,
    createdAt: row.createdAt,
  }
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
  requireUser,
  zValidator('query', listQuery, (result, c) => {
    if (!result.success) return c.json(invalidRequest(result.error), 400)
  }),
  async (c) => {
    const { db, deps } = c.var
    const query = c.req.valid('query')
    const userId = currentUser(c).id
    await chargeDaily(c.env.DB, userId, 'read', deps.now())
    const limit = query.limit ?? DEFAULT_PAGE_SIZE
    const filters: (SQL | undefined)[] = [eq(activities.userId, userId)]
    if (query.since !== undefined) filters.push(gte(activities.createdAt, query.since))
    let scanAfter = query.cursor === undefined ? undefined : decodeCursor(query.cursor)
    const pageRows: ActivityRow[] = []
    let pageDigestBytes = 0
    let hasMore = false
    const candidatePageSize = limit + 1

    // Digest JSON is capped at 256 KiB per activity. Scan only small metadata first, then fetch
    // the rows that fit the page byte budget; a large library cannot create a huge JSON response.
    while (pageRows.length < limit) {
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
        if (pageRows.length + selected.length >= limit) break
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
        pageRows.push(row)
        pageDigestBytes += candidate.digestBytes
      }

      const lastScanned = selected.at(-1)
      if (!lastScanned) break
      scanAfter = { createdAt: lastScanned.createdAt, id: lastScanned.id }
      if (pageRows.length >= limit) {
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
    const last = pageRows.at(-1)
    const nextCursor =
      hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null
    const page: ActivityPage = { items: pageRows.map(toRecord), nextCursor }
    return c.json(page, 200)
  },
)

activityRoutes.post('/', limitBody(MAX_CREATE_BODY_BYTES), requireUser, async (c) => {
  const { db, deps } = c.var
  const userId = currentUser(c).id
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
  if (new TextEncoder().encode(digestJson).byteLength > MAX_DIGEST_BYTES) {
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

    // A matching source file can be re-digested after a model change. Compare and update inside
    // one D1 write so simultaneous retries cannot overwrite a newer digest or file metadata.
    const upgraded = await db
      .update(activities)
      .set({ digestJson, digestVersion: digest.version, name: digest.name })
      .where(
        and(
          eq(activities.id, existing.id),
          eq(activities.userId, userId),
          eq(activities.fileHash, fileHash),
          sql`coalesce(json_extract(digest_json, '$.modelRevision'), 1) < ${digest.modelRevision}`,
        ),
      )
      .returning()
      .get()
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

  const existing = await selectExisting()
  if (existing) return respondForExisting(existing)

  // Only a request that will insert a new row takes a daily create unit.
  const charge = await chargeDaily(c.env.DB, userId, 'activityCreate', deps.now())
  const id = deps.randomUUID()
  // One D1 transaction: the insert is admitted only while the stored counter is under the cap and
  // the account is not being deleted, and the counter moves only if that insert happened.
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
        digest_json, file_name, file_hash, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE (SELECT activity_count FROM users WHERE id = ?) < ?
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
    ),
    c.env.DB.prepare(
      `UPDATE users SET activity_count = activity_count + 1
       WHERE id = ? AND EXISTS (SELECT 1 FROM activities WHERE id = ? AND user_id = ?)`,
    ).bind(userId, id, userId),
  ])

  const afterInsert = await selectExisting()
  if (afterInsert?.id === id) return c.json(toRecord(afterInsert), 201)

  await charge.refund()
  if (afterInsert) return respondForExisting(afterInsert)
  throw new HttpError(
    403,
    'activity_quota',
    `You can store at most ${MAX_ACTIVITIES_PER_USER} activities`,
  )
})

/**
 * Stores the original file for an activity while the caller holds an upload slot. Charges the
 * daily upload unit and reserves bytes before R2 is called. Refusals before the R2 call give
 * everything back; a failed R2 write keeps the reservation so a same-activity retry can finish.
 */
async function storeOriginalFile(
  c: Context<AppEnv>,
  row: ActivityRow,
  userId: string,
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

  const body = await readBody(c.req.raw, MAX_FILE_BYTES)
  if (body.byteLength === 0) throw new HttpError(400, 'empty_file', 'File body is empty')
  if ((await sha256Hex(body)) !== row.fileHash) {
    throw new HttpError(422, 'hash_mismatch', 'File does not match the digest it was uploaded for')
  }

  const charge: DailyCharge = await chargeDaily(c.env.DB, userId, 'fileUpload', deps.now())
  const reservedSize = body.byteLength
  const stored = await db
    .update(activities)
    .set({ fileSize: reservedSize })
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
    await charge.refund()
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
  try {
    await reserveR2Put(c.env.DB, deps.now, reservedSize)
  } catch (error) {
    // Refused before any R2 call: release the bytes and the daily unit. A parallel request that
    // reserved the same size is unaffected by the restored value.
    await db
      .update(activities)
      .set({ fileSize: row.fileSize })
      .where(
        and(
          eq(activities.id, row.id),
          eq(activities.userId, userId),
          eq(activities.fileSize, reservedSize),
        ),
      )
    await charge.refund()
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
    .set({ fileKey: key, fileSize: reservedSize })
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
      .set({ fileKey: null, fileSize: null })
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

  const profile = await ensureProfile(db, userId, deps.now())
  if (!profile.keepFiles) {
    throw new HttpError(409, 'files_disabled', 'Original files are turned off in your profile')
  }

  // The slot is taken before the body is read, so at most two bodies per user are in memory.
  const slot = deps.randomUUID()
  await acquireUploadSlot(c.env.DB, userId, slot, deps.now())
  try {
    return await storeOriginalFile(c, row, userId)
  } finally {
    await releaseUploadSlot(c.env.DB, userId, slot)
  }
})

activityRoutes.get('/:id/file', requireUser, async (c) => {
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
    c.env.DB.prepare(
      `UPDATE users SET activity_count = activity_count - 1
       WHERE id = ? AND EXISTS (SELECT 1 FROM activities WHERE id = ? AND user_id = ?)`,
    ).bind(userId, row.id, userId),
    c.env.DB.prepare('DELETE FROM activities WHERE id = ? AND user_id = ? RETURNING file_key').bind(
      row.id,
      userId,
    ),
  ])
  const deletedRows = (removed?.results ?? []) as { file_key: string | null }[]
  if (deletedRows.length === 0) throw new HttpError(404, 'not_found', 'Activity not found')

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
