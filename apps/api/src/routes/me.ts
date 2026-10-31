import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, eq, isNotNull, or, sql } from 'drizzle-orm'
import { ProfileInputSchema, unitsForAcceptLanguage } from '@rca/contract'
import type { AppEnv } from '../env.ts'
import { buildMe, ensureProfile, toProfile } from '../auth/accounts.ts'
import { clearSessionCookie } from '../auth/session.ts'
import { chargeDaily } from '../budget.ts'
import { finishAccountDeletion, startAccountDeletion } from '../accountDeletion.ts'
import { HttpError } from '../errors.ts'
import { currentUser, optionalUser, requireUser, requireUserEvenIfDeleting } from '../middleware.ts'
import { invalidRequest, limitBody } from '../http.ts'
import { hasStoredFiles, sweepUserFiles } from '../storage.ts'
import { must } from '../util.ts'
import { activities, profiles, users } from '../db/schema.ts'

const PROFILE_BODY_BYTES = 4 * 1024

/**
 * Rows that record a stored file, a size or an upload reservation. Clearing only these writes a
 * few rows when a library of thousands has a few originals, instead of rewriting every row.
 */
function hasFileState() {
  return or(
    isNotNull(activities.fileKey),
    isNotNull(activities.fileSize),
    isNotNull(activities.fileReservationToken),
  )
}

export const meRoutes = new Hono<AppEnv>()

meRoutes.get('/me', optionalUser, async (c) => {
  const { deps, db } = c.var
  const user = c.var.user
  // A signed-out visitor gets a null body, not a 401: every page load asks, and a 401 is logged as an error.
  if (!user) return c.json(null, 200)
  // A constant-size read, bounded by the edge rate limiter. The daily read budget is for library
  // listings, whose cost grows with the library; charging page loads here would lock people out.
  const units = unitsForAcceptLanguage(c.req.header('accept-language'))
  const me = await buildMe(db, deps, user, Boolean(c.env.FILES), units)
  return c.json({ ...me, libraryRevision: await libraryRevision(db, user.id) }, 200)
})

/**
 * A tag that changes whenever the library does: the count of stored activities and the bytes of their
 * digests, both kept by the same statements that insert, upgrade and delete rows. Another tab or device
 * compares it for inequality only, as a hint that its copy of the library may be out of date. It is
 * not a version: an edit that changes neither number is not seen, and nothing relies on it being exact.
 */
async function libraryRevision(db: AppEnv['Variables']['db'], userId: string): Promise<string> {
  const row = await db
    .select({ count: users.activityCount, bytes: users.digestBytes })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  return row === undefined ? '0.0' : `${row.count}.${row.bytes}`
}

meRoutes.put(
  '/profile',
  limitBody(PROFILE_BODY_BYTES),
  requireUser,
  zValidator('json', ProfileInputSchema, (result, c) => {
    if (!result.success) return c.json(invalidRequest(result.error), 400)
  }),
  async (c) => {
    const { deps, db } = c.var
    const input = c.req.valid('json')
    const userId = currentUser(c).id
    const updatedAt = deps.now()
    await chargeDaily(c.env.DB, userId, 'profileWrite', updatedAt)
    const existing = await db.select().from(profiles).where(eq(profiles.userId, userId)).get()
    if (!c.env.FILES && input.keepFiles && !existing?.keepFiles) {
      throw new HttpError(
        503,
        'file_storage_unavailable',
        'Original-file storage is not available in this deployment',
      )
    }
    // A missing profile is created with the units this write sets, which the upsert below sets anyway.
    const before = existing
      ? toProfile(existing)
      : await ensureProfile(db, userId, updatedAt, input.units)
    const turningFilesOff = before.keepFiles && !input.keepFiles
    // Only an account with stored files needs the R2 sweeps. Without them, no cleanup budget is spent.
    const sweepFiles = turningFilesOff && (await hasStoredFiles(c.env.DB, userId))
    if (sweepFiles && !c.env.FILES) {
      throw new HttpError(
        503,
        'file_storage_unavailable',
        'Original files must be available before stored-file data can be removed',
      )
    }
    const bucket = c.env.FILES
    // Sweep before the profile changes, so a failed sweep leaves the profile and files as they were.
    if (sweepFiles && bucket) {
      await sweepUserFiles(c.env.DB, bucket, userId, deps.now)
      await db
        .update(activities)
        .set({ fileKey: null, fileSize: null, fileReservationToken: null })
        .where(and(eq(activities.userId, userId), hasFileState()))
    }
    // Optional fields that were left out are not in `values`, so an upsert keeps the saved value.
    const values = { ...input, updatedAt }
    const saved = await db
      .insert(profiles)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: profiles.userId, set: values })
      .returning()
      .get()
    if (sweepFiles && bucket) {
      // An upload that passed the keepFiles check before the change can still land its object.
      await sweepUserFiles(c.env.DB, bucket, userId, deps.now)
      await db
        .update(activities)
        .set({ fileKey: null, fileSize: null, fileReservationToken: null })
        .where(
          and(
            eq(activities.userId, userId),
            hasFileState(),
            sql`EXISTS (SELECT 1 FROM profiles WHERE user_id = ${userId} AND keep_files = 0)`,
          ),
        )
    }
    return c.json(toProfile(must(saved, 'profile')), 200)
  },
)

/**
 * Deletes the account. The deletion is recorded before anything is removed, so a failure at any
 * point can be retried with the same session, or finished by the scheduler once the rows are gone.
 */
meRoutes.delete('/me', requireUserEvenIfDeleting, async (c) => {
  const { deps } = c.var
  const userId = currentUser(c).id
  if (!c.env.FILES) {
    const fileRow = await c.var.db
      .select({ id: activities.id })
      .from(activities)
      .where(
        and(
          eq(activities.userId, userId),
          sql`(${activities.fileKey} IS NOT NULL OR ${activities.fileSize} IS NOT NULL)`,
        ),
      )
      .get()
    if (fileRow) {
      throw new HttpError(
        503,
        'file_storage_unavailable',
        'Original files must be available before this account can be deleted',
      )
    }
  }
  await startAccountDeletion(c.env, userId, deps.now())
  await finishAccountDeletion(c.env, deps, userId)
  clearSessionCookie(c)
  return c.body(null, 204)
})
