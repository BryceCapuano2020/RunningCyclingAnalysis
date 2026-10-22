import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { ProfileInputSchema } from '@rca/contract'
import { eq } from 'drizzle-orm'
import type { AppEnv } from '../env.ts'
import { buildMe, ensureProfile, toProfile } from '../auth/accounts.ts'
import { clearSessionCookie } from '../auth/session.ts'
import { currentUser, requireUser } from '../middleware.ts'
import { invalidRequest } from '../http.ts'
import { deleteByPrefix, userFilePrefix } from '../storage.ts'
import { activities, profiles, users } from '../db/schema.ts'

export const meRoutes = new Hono<AppEnv>()

meRoutes.get('/me', requireUser, async (c) => {
  const { deps, db } = c.var
  return c.json(await buildMe(db, deps, currentUser(c)), 200)
})

meRoutes.put(
  '/profile',
  requireUser,
  zValidator('json', ProfileInputSchema, (result, c) => {
    if (!result.success) return c.json(invalidRequest(result.error), 400)
  }),
  async (c) => {
    const { deps, db } = c.var
    const input = c.req.valid('json')
    const userId = currentUser(c).id
    const updatedAt = deps.now()
    const before = await ensureProfile(db, userId, updatedAt)
    if (before.keepFiles && !input.keepFiles) {
      // Files go first and the rows second: if R2 fails, nothing has changed and the request can be retried.
      await deleteByPrefix(c.env.FILES, userFilePrefix(userId))
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
    return c.json(toProfile({ userId, ...values }), 200)
  },
)

/** Deletes the account: stored files first (so a failure can be retried), then the user row. */
meRoutes.delete('/me', requireUser, async (c) => {
  const userId = currentUser(c).id
  await deleteByPrefix(c.env.FILES, userFilePrefix(userId))
  await c.var.db.delete(users).where(eq(users.id, userId))
  clearSessionCookie(c)
  return c.body(null, 204)
})
