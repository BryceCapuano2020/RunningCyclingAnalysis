import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { eq } from 'drizzle-orm'
import type { User } from '@rca/contract'
import type { AppEnv } from '../env.ts'
import { sessions, users } from '../db/schema.ts'
import { sha256Hex, toHex } from '../util.ts'
import { toUser } from './accounts.ts'

const DAY_MS = 24 * 60 * 60 * 1000
export const SESSION_TTL_MS = 30 * DAY_MS
/** Sessions end this long after creation, however often they are used. */
export const SESSION_ABSOLUTE_MS = 90 * DAY_MS
/** Sessions with less than this left are extended on use. */
export const SESSION_REFRESH_WITHIN_MS = 15 * DAY_MS
/** Session tokens are 32 random bytes in lowercase hex. Anything else is rejected before any D1 call. */
export const SESSION_TOKEN_PATTERN = /^[0-9a-f]{64}$/

type Ctx = Context<AppEnv>

/** Secure everywhere except local development, where the app runs on plain http. */
export function isSecure(c: Ctx): boolean {
  return c.env.ENVIRONMENT !== 'development'
}

/** Outside development the __Host- prefix pins the cookie to this exact origin. */
export function sessionCookieName(c: Ctx): string {
  return isSecure(c) ? '__Host-rca_session' : 'rca_session'
}

function setSessionCookie(c: Ctx, token: string, expiresAt: number): void {
  setCookie(c, sessionCookieName(c), token, {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: 'Lax',
    path: '/',
    expires: new Date(expiresAt),
  })
}

export function clearSessionCookie(c: Ctx): void {
  deleteCookie(c, sessionCookieName(c), { path: '/', secure: isSecure(c), sameSite: 'Lax' })
}

/** The session token from the cookie, only if it has the exact token shape. */
function readSessionToken(c: Ctx): string | undefined {
  const value = getCookie(c, sessionCookieName(c))
  return value !== undefined && SESSION_TOKEN_PATTERN.test(value) ? value : undefined
}

/** Creates a session row for the user and sets the cookie. The row stores only sha-256(token). */
export async function createSession(c: Ctx, userId: string): Promise<void> {
  const { deps, db } = c.var
  const token = toHex(deps.randomBytes(32))
  const createdAt = deps.now()
  const expiresAt = createdAt + SESSION_TTL_MS
  await db.insert(sessions).values({ id: await sha256Hex(token), userId, expiresAt, createdAt })
  setSessionCookie(c, token, expiresAt)
}

/**
 * Resolves the signed-in user from the session cookie. Expired or over-age sessions are deleted.
 * Sessions close to expiry are extended, but never past createdAt + 90 days.
 * Returns null when there is no valid session; malformed cookies never reach D1.
 */
export async function loadSession(c: Ctx): Promise<User | null> {
  const token = readSessionToken(c)
  if (token === undefined) {
    if (getCookie(c, sessionCookieName(c))) clearSessionCookie(c)
    return null
  }

  const { deps, db } = c.var
  const now = deps.now()
  const id = await sha256Hex(token)
  const row = await db
    .select({ expiresAt: sessions.expiresAt, createdAt: sessions.createdAt, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .get()

  if (!row) {
    clearSessionCookie(c)
    return null
  }
  const hardEnd = row.createdAt + SESSION_ABSOLUTE_MS
  if (row.expiresAt <= now || hardEnd <= now) {
    await db.delete(sessions).where(eq(sessions.id, id))
    clearSessionCookie(c)
    return null
  }
  if (row.expiresAt - now < SESSION_REFRESH_WITHIN_MS) {
    const expiresAt = Math.min(now + SESSION_TTL_MS, hardEnd)
    if (expiresAt > row.expiresAt) {
      await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id))
      setSessionCookie(c, token, expiresAt)
    }
  }
  return toUser(row.user)
}

/** Deletes the current session row, if the cookie has a valid shape, and clears the cookie. */
export async function endSession(c: Ctx): Promise<void> {
  const token = readSessionToken(c)
  if (token !== undefined) {
    await c.var.db.delete(sessions).where(eq(sessions.id, await sha256Hex(token)))
  }
  clearSessionCookie(c)
}
