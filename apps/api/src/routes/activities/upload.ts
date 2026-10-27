import { Hono, type Context } from 'hono'
import { and, eq, isNull, sql } from 'drizzle-orm'
import {
  DAILY_UPLOAD_BYTES,
  MAX_FILE_BYTES,
  MAX_STORED_BYTES_PER_USER,
  unitsForAcceptLanguage,
} from '@rca/contract'
import type { AppEnv, Db } from '../../env.ts'
import { accountDeleting, apiError, HttpError } from '../../errors.ts'
import { ensureProfile } from '../../auth/accounts.ts'
import { currentUser, requireUser } from '../../middleware.ts'
import { declaredLength, readExactBody } from '../../http.ts'
import {
  chargeDaily,
  acquireUploadSlot,
  nextUtcMidnight,
  releaseUploadSlot,
  utcDay,
  type DailyCharge,
} from '../../budget.ts'
import { activityFileKey, checkR2PutBudget, reserveR2Put } from '../../storage.ts'
import { activities } from '../../db/schema.ts'
import { sha256Hex } from '../../util.ts'
import { fileStorageUnavailable, findOwnedActivity, toRecord, type ActivityRow } from './shared.ts'

/** One upload in progress: the activity its file is for, and the reservation it holds. */
interface Upload {
  row: ActivityRow
  userId: string
  declared: number
  /**
   * This request's upload slot. It is the reservation token, so only this request gives the
   * reservation back.
   */
  slot: string
  /** The object key the original file is stored under. */
  key: string
}

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

/** Refuses an empty or oversized declared length; undefined when none is declared (411). */
function validateLength(request: Request): number | undefined {
  const declared = declaredLength(request)
  if (declared === undefined) return undefined
  if (declared > MAX_FILE_BYTES) {
    throw new HttpError(413, 'payload_too_large', `Body is larger than ${MAX_FILE_BYTES} bytes`)
  }
  if (declared === 0) throw new HttpError(400, 'empty_file', 'File body is empty')
  return declared
}

/** Admits the upload on the R2 ledger and daily allowances; the charge refunds all of them. */
async function chargeUpload(
  c: Context<AppEnv>,
  userId: string,
  declared: number,
): Promise<DailyCharge> {
  const { deps } = c.var
  await checkR2PutBudget(c.env.DB, deps.now(), declared)
  const charge: DailyCharge = await chargeDaily(c.env.DB, userId, 'fileUpload', deps.now())
  const bytesCharge = await chargeUploadBytes(c.env.DB, userId, declared, deps.now()).catch(
    async (error: unknown) => {
      await charge.refund()
      throw error
    },
  )
  return {
    refund: async () => {
      await charge.refund()
      await bytesCharge.refund()
    },
  }
}

/** Reserves the bytes on the row in one atomic write; a refusal gives the charges back first. */
async function reserveStorage(
  c: Context<AppEnv>,
  upload: Upload,
  charges: DailyCharge,
): Promise<void> {
  const { db, deps } = c.var
  const { row, userId, declared, slot } = upload
  const stored = await db
    .update(activities)
    .set({
      fileSize: declared,
      // A reservation that a live upload holds keeps its token, so only that upload can release it.
      fileReservationToken: sql`CASE WHEN ${activities.fileReservationToken} IN (
          SELECT slot_id FROM upload_slots WHERE user_id = ${userId} AND expires_at > ${deps.now()}
        ) THEN ${activities.fileReservationToken} ELSE ${slot} END`,
    })
    .where(
      and(
        eq(activities.id, row.id),
        eq(activities.userId, userId),
        // Reserve the bytes in the activity row with one atomic D1 write. The user's file_bytes
        // moves with it, so concurrent uploads see this reservation when checking the same user's
        // remaining storage, without summing the user's rows.
        sql`EXISTS (SELECT 1 FROM users WHERE id = ${userId} AND deleting_at IS NULL)`,
        sql`(SELECT file_bytes FROM users WHERE id = ${userId})
          - coalesce(file_size, 0) <= ${MAX_STORED_BYTES_PER_USER - declared}`,
      ),
    )
    .returning()
    .get()
  if (stored) return
  await charges.refund()
  // A missing row means a delete won the race; a present row means the reservation exceeded
  // the user's quota, or the account is being deleted.
  await findOwnedActivity(db, userId, row.id)
  const deleting = await c.env.DB.prepare(
    'SELECT 1 AS found FROM users WHERE id = ? AND deleting_at IS NOT NULL',
  )
    .bind(userId)
    .first()
  if (deleting) throw accountDeleting()
  throw new HttpError(403, 'storage_quota', 'Storing this file would exceed your storage limit')
}

/** Gives back this upload's reservation, only while it still holds the row and its file key. */
async function releaseReservation(db: Db, upload: Upload): Promise<void> {
  const { row, userId, slot } = upload
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

/** Reads and hashes the body; a failed read or a mismatch gives the reservation back. */
async function readAndHash(c: Context<AppEnv>, upload: Upload): Promise<Uint8Array> {
  const { db } = c.var
  let body: Uint8Array
  try {
    body = await readExactBody(c.req.raw, upload.declared, MAX_FILE_BYTES)
  } catch (error) {
    // The body was being read, so the daily charges stand: an upload that was consumed is not free.
    await releaseReservation(db, upload)
    throw error
  }
  if ((await sha256Hex(body)) !== upload.row.fileHash) {
    await releaseReservation(db, upload)
    throw new HttpError(422, 'hash_mismatch', 'File does not match the digest it was uploaded for')
  }
  return body
}

/** Admits the write on the R2 ledger, then stores the object; a refusal refunds every unit. */
async function putOriginal(
  c: Context<AppEnv>,
  bucket: R2Bucket,
  upload: Upload,
  charges: DailyCharge,
  body: Uint8Array,
): Promise<void> {
  const { db, deps } = c.var
  try {
    await reserveR2Put(c.env.DB, deps.now, upload.declared)
  } catch (error) {
    // Refused before any R2 call, for the deployment's own ledger rather than the body: nothing was
    // stored, so every daily unit goes back.
    await releaseReservation(db, upload)
    await charges.refund()
    throw error
  }
  // Deleting the activity, disabling file retention or deleting the account releases a reservation
  // that a failed write left behind.
  await bucket.put(upload.key, body, {
    httpMetadata: { contentType: 'application/octet-stream' },
    storageClass: 'Standard',
  })
}

/** Points the row at the object if retention is on, otherwise rolls the object back. */
async function commitOriginal(
  c: Context<AppEnv>,
  bucket: R2Bucket,
  upload: Upload,
): Promise<ActivityRow> {
  const { db } = c.var
  const { row, userId, declared, key } = upload
  const updated = await db
    .update(activities)
    .set({ fileKey: key, fileSize: declared, fileReservationToken: null })
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
  if (updated) return updated
  throw await rollbackOriginal(db, bucket, upload)
}

/** Removes an uncommitted object and clears the row's file; returns the refusal to throw. */
async function rollbackOriginal(db: Db, bucket: R2Bucket, upload: Upload): Promise<HttpError> {
  const { row, userId, key } = upload
  await bucket.delete(key)
  await findOwnedActivity(db, userId, row.id)
  await db
    .update(activities)
    .set({ fileKey: null, fileSize: null, fileReservationToken: null })
    .where(and(eq(activities.id, row.id), eq(activities.userId, userId)))
  return new HttpError(409, 'files_disabled', 'Original files are turned off in your profile')
}

/**
 * Stores the original file for an activity while the caller holds an upload slot. Charges and the
 * reservation come first, so a refusal before the body is read gives everything back. Once the body
 * is being read its daily charges stand, even when the read or the hash then fails.
 */
async function storeOriginalFile(
  c: Context<AppEnv>,
  row: ActivityRow,
  userId: string,
  declared: number,
  slot: string,
): Promise<Response> {
  const bucket = c.env.FILES
  if (!bucket) throw fileStorageUnavailable()
  const upload: Upload = { row, userId, declared, slot, key: activityFileKey(userId, row.id) }

  const charges = await chargeUpload(c, userId, declared)
  await reserveStorage(c, upload, charges)
  const body = await readAndHash(c, upload)
  await putOriginal(c, bucket, upload, charges, body)
  return c.json(toRecord(await commitOriginal(c, bucket, upload)), 200)
}

export const uploadRoutes = new Hono<AppEnv>()

uploadRoutes.put('/:id/file', requireUser, async (c) => {
  const { db, deps } = c.var
  const userId = currentUser(c).id
  const row = await findOwnedActivity(db, userId, c.req.param('id'))

  // Do not reserve quota or create a default profile in deployments without file storage.
  if (!c.env.FILES) throw fileStorageUnavailable()

  const declared = validateLength(c.req.raw)
  if (declared === undefined) {
    return c.json(apiError('length_required', 'Send the file with a Content-Length header'), 411)
  }

  const profile = await ensureProfile(
    db,
    userId,
    deps.now(),
    unitsForAcceptLanguage(c.req.header('accept-language')),
  )
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
