import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import type { SessionList, SessionRevoke } from '@rca/contract'
import type { AppEnv } from '../env.ts'
import { clearSessionCookie, currentSessionId } from '../auth/session.ts'
import { sessions } from '../db/schema.ts'
import { invalidRequest } from '../http.ts'
import { currentUser, requireUser } from '../middleware.ts'

const revokeQuery = z.object({
  /** `current` ends the other sessions and keeps this one; left out, every session ends. */
  keep: z.literal('current').optional(),
})

export const sessionRoutes = new Hono<AppEnv>()

sessionRoutes.get('/', requireUser, async (c) => {
  const userId = currentUser(c).id
  const current = await currentSessionId(c)
  const rows = await c.var.db
    .select({ id: sessions.id, createdAt: sessions.createdAt, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.createdAt), desc(sessions.id))
  const body: SessionList = {
    sessions: rows.map((row) => ({
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      current: row.id === current,
    })),
  }
  return c.json(body, 200)
})

/**
 * Ends the account's sessions as a set: all of them, signing this browser out too, or with
 * `?keep=current` only the others. There is no per-session id to name, by design.
 */
sessionRoutes.delete(
  '/',
  requireUser,
  zValidator('query', revokeQuery, (result, c) => {
    if (!result.success) return c.json(invalidRequest(result.error), 400)
  }),
  async (c) => {
    const userId = currentUser(c).id
    const keepCurrent = c.req.valid('query').keep === 'current'
    const current = await currentSessionId(c)
    const owned = eq(sessions.userId, userId)
    const ended = await c.var.db
      .delete(sessions)
      .where(keepCurrent && current !== undefined ? and(owned, ne(sessions.id, current)) : owned)
      .returning({ id: sessions.id })
    if (!keepCurrent) clearSessionCookie(c)
    const body: SessionRevoke = { revoked: ended.length }
    return c.json(body, 200)
  },
)
