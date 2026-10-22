import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, gte, lt, or, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import {
  ActivityCreateSchema,
  ActivityDigestSchema,
  DEFAULT_PAGE_SIZE,
  MAX_ACTIVITIES_PER_USER,
  MAX_DIGEST_BYTES,
  MAX_FILE_BYTES,
  MAX_PAGE_SIZE,
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
import { activityFileKey } from '../storage.ts'
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
    fileSize: row.fileSize,
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
    const { db } = c.var
    const query = c.req.valid('query')
    const userId = currentUser(c).id
    const limit = query.limit ?? DEFAULT_PAGE_SIZE
    const filters: (SQL | undefined)[] = [eq(activities.userId, userId)]
    if (query.since !== undefined) filters.push(gte(activities.createdAt, query.since))
    if (query.cursor !== undefined) {
      const after = decodeCursor(query.cursor)
      filters.push(
        or(
          lt(activities.createdAt, after.createdAt),
          and(eq(activities.createdAt, after.createdAt), lt(activities.id, after.id)),
        ),
      )
    }
    // One extra row tells us whether another page exists.
    const rows = await db
      .select()
      .from(activities)
      .where(and(...filters))
      .orderBy(desc(activities.createdAt), desc(activities.id))
      .limit(limit + 1)
    const pageRows = rows.slice(0, limit)
    const last = pageRows.at(-1)
    const nextCursor =
      rows.length > limit && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null
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

  const existing = await selectExisting()
  if (existing) return c.json(toRecord(existing), 200)

  const count = await db
    .select({ total: sql<number>`count(*)` })
    .from(activities)
    .where(eq(activities.userId, userId))
    .get()
  if ((count?.total ?? 0) >= MAX_ACTIVITIES_PER_USER) {
    throw new HttpError(
      403,
      'activity_quota',
      `You can store at most ${MAX_ACTIVITIES_PER_USER} activities`,
    )
  }

  const inserted = await db
    .insert(activities)
    .values({
      id: deps.randomUUID(),
      userId,
      dedupeKey,
      sport: digest.sport,
      startMs: digest.startMs,
      name: digest.name,
      digestVersion: digest.version,
      digestJson,
      fileName,
      fileHash,
      fileKey: null,
      fileSize: null,
      createdAt: deps.now(),
    })
    .onConflictDoNothing()
    .returning()
    .get()
  if (inserted) return c.json(toRecord(inserted), 201)

  // Lost a race with a concurrent upload of the same activity.
  return c.json(toRecord(must(await selectExisting(), 'activity')), 200)
})

activityRoutes.put('/:id/file', requireUser, async (c) => {
  const { db, deps } = c.var
  const userId = currentUser(c).id
  const row = await findOwnedActivity(db, userId, c.req.param('id'))

  const profile = await ensureProfile(db, userId, deps.now())
  if (!profile.keepFiles) {
    throw new HttpError(409, 'files_disabled', 'Original files are turned off in your profile')
  }

  const body = await readBody(c.req.raw, MAX_FILE_BYTES)
  if (body.byteLength === 0) throw new HttpError(400, 'empty_file', 'File body is empty')
  if ((await sha256Hex(body)) !== row.fileHash) {
    throw new HttpError(422, 'hash_mismatch', 'File does not match the digest it was uploaded for')
  }

  const stored = await db
    .select({ total: sql<number>`coalesce(sum(${activities.fileSize}), 0)` })
    .from(activities)
    .where(eq(activities.userId, userId))
    .get()
  // This file replaces the activity's current one, so that file's bytes do not count twice.
  const otherBytes = (stored?.total ?? 0) - (row.fileSize ?? 0)
  if (otherBytes + body.byteLength > MAX_STORED_BYTES_PER_USER) {
    throw new HttpError(403, 'storage_quota', 'Storing this file would exceed your storage limit')
  }

  const key = activityFileKey(userId, row.id)
  await c.env.FILES.put(key, body, {
    httpMetadata: { contentType: 'application/octet-stream' },
  })
  const updated = await db
    .update(activities)
    .set({ fileKey: key, fileSize: body.byteLength })
    .where(eq(activities.id, row.id))
    .returning()
    .get()
  return c.json(toRecord(must(updated, 'activity')), 200)
})

activityRoutes.get('/:id/file', requireUser, async (c) => {
  const { db } = c.var
  const row = await findOwnedActivity(db, currentUser(c).id, c.req.param('id'))
  if (!row.fileKey) throw new HttpError(404, 'no_file', 'This activity has no stored file')

  const object = await c.env.FILES.get(row.fileKey)
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
  const { db } = c.var
  const row = await findOwnedActivity(db, currentUser(c).id, c.req.param('id'))
  if (row.fileKey) await c.env.FILES.delete(row.fileKey)
  await db.delete(activities).where(eq(activities.id, row.id))
  return c.body(null, 204)
})
