import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, eq, sql } from 'drizzle-orm'
import { ProfileInputSchema } from '@rca/contract'
import type { AppEnv } from '../env.ts'
import { buildMe, ensureProfile, toProfile } from '../auth/accounts.ts'
import { clearSessionCookie } from '../auth/session.ts'
import { chargeDaily } from '../budget.ts'
import { finishAccountDeletion, startAccountDeletion } from '../accountDeletion.ts'
import { HttpError } from '../errors.ts'
import { currentUser, requireUser, requireUserEvenIfDeleting } from '../middleware.ts'
import { invalidRequest, limitBody } from '../http.ts'
import { hasStoredFiles, sweepUserFiles } from '../storage.ts'
import { activities, profiles } from '../db/schema.ts'

const PROFILE_BODY_BYTES = 4 * 1024

export const meRoutes = new Hono<AppEnv>()

meRoutes.get('/me', requireUser, async (c) => {
  const { deps, db } = c.var
  const user = currentUser(c)
  await chargeDaily(c.env.DB, user.id, 'read', deps.now())
  return c.json(await buildMe(db, deps, user, Boolean(c.env.FILES)), 200)
})

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
    const before = existing ? toProfile(existing) : await ensureProfile(db, userId, updatedAt)
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
        .set({ fileKey: null, fileSize: null })
        .where(eq(activities.userId, userId))
    }
    const values = { ...input, updatedAt }
    await db
      .insert(profiles)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: profiles.userId, set: values })
    if (sweepFiles && bucket) {
      // An upload that passed the keepFiles check before the change can still land its object.
      await sweepUserFiles(c.env.DB, bucket, userId, deps.now)
      await db
        .update(activities)
        .set({ fileKey: null, fileSize: null })
        .where(
          and(
            eq(activities.userId, userId),
            sql`EXISTS (SELECT 1 FROM profiles WHERE user_id = ${userId} AND keep_files = 0)`,
          ),
        )
    }
    return c.json(toProfile({ userId, ...values }), 200)
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
