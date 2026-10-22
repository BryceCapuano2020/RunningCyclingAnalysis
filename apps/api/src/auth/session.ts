import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { eq } from 'drizzle-orm'
import type { User } from '@rca/contract'
import type { AppEnv } from '../env.ts'
import { sessions, users } from '../db/schema.ts'
import { sha256Hex, toHex } from '../util.ts'
import { toUser } from './accounts.ts'

export const SESSION_COOKIE = 'rca_session'
const DAY_MS = 24 * 60 * 60 * 1000
export const SESSION_TTL_MS = 30 * DAY_MS
/** Sessions with less than this left are extended on use. */
export const SESSION_REFRESH_WITHIN_MS = 15 * DAY_MS

type Ctx = Context<AppEnv>

/** Secure everywhere except local development, where the app runs on plain http. */
export function isSecure(c: Ctx): boolean {
  return c.env.ENVIRONMENT !== 'development'
}

function setSessionCookie(c: Ctx, token: string, expiresAt: number): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: 'Lax',
    path: '/',
    expires: new Date(expiresAt),
  })
}

export function clearSessionCookie(c: Ctx): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: isSecure(c), sameSite: 'Lax' })
}

/** Creates a session row for the user and sets the cookie. The row stores only sha-256(token). */
export async function createSession(c: Ctx, userId: string): Promise<void> {
  const { deps, db } = c.var
  const token = toHex(deps.randomBytes(32))
  const expiresAt = deps.now() + SESSION_TTL_MS
  await db.insert(sessions).values({ id: await sha256Hex(token), userId, expiresAt })
  setSessionCookie(c, token, expiresAt)
}

/**
 * Resolves the signed-in user from the session cookie. Expired sessions are deleted, and
 * sessions close to expiry are extended. Returns null when there is no valid session.
 */
export async function loadSession(c: Ctx): Promise<User | null> {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return null

  const { deps, db } = c.var
  const now = deps.now()
  const id = await sha256Hex(token)
  const row = await db
    .select({ expiresAt: sessions.expiresAt, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .get()

  if (!row) {
    clearSessionCookie(c)
    return null
  }
  if (row.expiresAt <= now) {
    await db.delete(sessions).where(eq(sessions.id, id))
    clearSessionCookie(c)
    return null
  }
  if (row.expiresAt - now < SESSION_REFRESH_WITHIN_MS) {
    const expiresAt = now + SESSION_TTL_MS
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id))
    setSessionCookie(c, token, expiresAt)
  }
  return toUser(row.user)
}

/** Deletes the current session row, if any, and clears the cookie. */
export async function endSession(c: Ctx): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) {
    await c.var.db.delete(sessions).where(eq(sessions.id, await sha256Hex(token)))
  }
  clearSessionCookie(c)
}
