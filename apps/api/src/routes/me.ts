import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { ProfileInputSchema } from '@rca/contract'
import { and, eq, sql } from 'drizzle-orm'
import type { AppEnv } from '../env.ts'
import { buildMe, ensureProfile, toProfile } from '../auth/accounts.ts'
import { clearSessionCookie } from '../auth/session.ts'
import { HttpError } from '../errors.ts'
import { currentUser, requireUser } from '../middleware.ts'
import { invalidRequest, limitBody } from '../http.ts'
import {
  deleteByPrefixWithBudget,
  releaseR2CleanupBudget,
  reserveR2CleanupBudget,
  userFilePrefix,
} from '../storage.ts'
import { activities, profiles, users } from '../db/schema.ts'

const PROFILE_BODY_BYTES = 4 * 1024

export const meRoutes = new Hono<AppEnv>()

meRoutes.get('/me', requireUser, async (c) => {
  const { deps, db } = c.var
  return c.json(await buildMe(db, deps, currentUser(c), Boolean(c.env.FILES)), 200)
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
    const cleanupBudget =
      turningFilesOff && c.env.FILES
        ? await reserveR2CleanupBudget(c.env.DB, updatedAt, undefined, deps.now)
        : undefined
    try {
      if (turningFilesOff) {
        if (c.env.FILES && cleanupBudget) {
          // Reserve both sweeps before D1 changes; a failed list/delete leaves the profile intact.
          await deleteByPrefixWithBudget(c.env.FILES, userFilePrefix(userId), cleanupBudget)
          await db
            .update(activities)
            .set({ fileKey: null, fileSize: null })
            .where(eq(activities.userId, userId))
        } else {
          const fileRow = await db
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
              'Original files must be available before stored-file data can be removed',
            )
          }
        }
      }
      const values = { ...input, updatedAt }
      await db
        .insert(profiles)
        .values({ userId, ...values })
        .onConflictDoUpdate({ target: profiles.userId, set: values })
      if (turningFilesOff && c.env.FILES && cleanupBudget) {
        // An upload that passed the keepFiles check before the change can still land its object.
        await deleteByPrefixWithBudget(c.env.FILES, userFilePrefix(userId), cleanupBudget)
        // Clear metadata for any object the second sweep just removed.
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
    } finally {
      if (cleanupBudget) await releaseR2CleanupBudget(c.env.DB, cleanupBudget)
    }
  },
)

/** Deletes the account: stored files first (so a failure can be retried), then the user row. */
meRoutes.delete('/me', requireUser, async (c) => {
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
  } else {
    const cleanupBudget = await reserveR2CleanupBudget(
      c.env.DB,
      c.var.deps.now(),
      undefined,
      c.var.deps.now,
    )
    try {
      await deleteByPrefixWithBudget(c.env.FILES, userFilePrefix(userId), cleanupBudget)
      await c.var.db.delete(users).where(eq(users.id, userId))
      // Sweep again: an upload that was in flight during the first sweep may have landed since.
      await deleteByPrefixWithBudget(c.env.FILES, userFilePrefix(userId), cleanupBudget)
    } finally {
      await releaseR2CleanupBudget(c.env.DB, cleanupBudget)
    }
  }
  if (!c.env.FILES) await c.var.db.delete(users).where(eq(users.id, userId))
  clearSessionCookie(c)
  return c.body(null, 204)
})
