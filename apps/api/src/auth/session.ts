import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { eq } from 'drizzle-orm'
import { MAX_SESSIONS_PER_USER, type User } from '@rca/contract'
import type { AppEnv } from '../env.ts'
import { HttpError } from '../errors.ts'
import { sessions, users } from '../db/schema.ts'
import { sha256Hex, toHex } from '../util.ts'
import { isLocalRequest } from '../localDev.ts'
import { toUser } from './accounts.ts'

const DAY_MS = 24 * 60 * 60 * 1000
export const SESSION_TTL_MS = 30 * DAY_MS
/** Sessions end this long after creation, however often they are used. */
export const SESSION_ABSOLUTE_MS = 90 * DAY_MS
/** Sessions with less than this left are extended on use. */
export const SESSION_REFRESH_WITHIN_MS = 15 * DAY_MS
/** Session tokens are 32 random bytes in lowercase hex. Anything else is rejected before any D1 call. */
export const SESSION_TOKEN_PATTERN = /^[0-9a-f]{64}$/
/** HMAC-SHA256 of the token, in lowercase hex. Verified before any D1 call. */
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/

type Ctx = Context<AppEnv>

/** Secure everywhere except local development, where the app runs on plain http. */
export function isSecure(c: Ctx): boolean {
  return !isLocalRequest(c)
}

/** Outside development the __Host- prefix pins the cookie to this exact origin. */
export function sessionCookieName(c: Ctx): string {
  return isSecure(c) ? '__Host-rca_session' : 'rca_session'
}

function sessionCookieOptions(c: Ctx) {
  return {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: 'Lax' as const,
    path: '/',
  }
}

/** A 256-bit HMAC key. A missing or shorter key fails closed; it is never padded or replaced. */
const MIN_SIGNING_KEY_BYTES = 32

async function signingKey(c: Ctx): Promise<CryptoKey> {
  const secret = new TextEncoder().encode(c.env.SESSION_SIGNING_KEY ?? '')
  if (secret.byteLength < MIN_SIGNING_KEY_BYTES) {
    throw new HttpError(503, 'service_unavailable', 'Service is temporarily unavailable')
  }
  return crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])
}

function fromHex(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16))
}

async function signToken(c: Ctx, token: string): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', await signingKey(c), new TextEncoder().encode(token))
  return toHex(new Uint8Array(mac))
}

function setSessionCookie(c: Ctx, token: string, signature: string, expiresAt: number): void {
  setCookie(c, sessionCookieName(c), `${token}.${signature}`, {
    ...sessionCookieOptions(c),
    expires: new Date(expiresAt),
  })
}

export function clearSessionCookie(c: Ctx): void {
  deleteCookie(c, sessionCookieName(c), { path: '/', secure: isSecure(c), sameSite: 'Lax' })
}

/**
 * The session token from the cookie, only if its shape is right and its HMAC verifies. Forged or
 * unsigned values are refused here, before any D1 call, so anyone can only cost CPU, not a query.
 */
async function verifiedToken(c: Ctx): Promise<string | undefined> {
  const value = getCookie(c, sessionCookieName(c))
  if (value === undefined) return undefined
  const [token, signature, extra] = value.split('.')
  if (
    extra !== undefined ||
    token === undefined ||
    signature === undefined ||
    !SESSION_TOKEN_PATTERN.test(token) ||
    !SIGNATURE_PATTERN.test(signature)
  ) {
    return undefined
  }
  const valid = await crypto.subtle.verify(
    'HMAC',
    await signingKey(c),
    fromHex(signature),
    new TextEncoder().encode(token),
  )
  return valid ? token : undefined
}

/**
 * The id of the session row the request's cookie names, when the cookie is signed and well formed.
 * It does not check that the row exists.
 */
export async function currentSessionId(c: Ctx): Promise<string | undefined> {
  const token = await verifiedToken(c)
  return token === undefined ? undefined : sha256Hex(token)
}

/**
 * Creates a session row for the user and sets the signed cookie. The row stores only sha-256(token).
 * The token is signed before the row is written, so a signing failure leaves no orphan row. The
 * same batch ends the user's sessions beyond the MAX_SESSIONS_PER_USER most recently inserted, so
 * the count is exactly bounded however many sign-ins happen at once. Insertion order (rowid) is
 * used instead of created_at because it is strictly increasing: the new row is always among the
 * newest, whatever the clocks of two isolates say and however many share a millisecond.
 */
export async function createSession(c: Ctx, userId: string): Promise<void> {
  const { deps, db } = c.var
  const token = toHex(deps.randomBytes(32))
  const signature = await signToken(c, token)
  const createdAt = deps.now()
  const expiresAt = createdAt + SESSION_TTL_MS
  const id = await sha256Hex(token)
  const d1 = db.$client
  await d1.batch([
    d1
      .prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .bind(id, userId, expiresAt, createdAt),
    d1
      .prepare(
        `DELETE FROM sessions WHERE user_id = ? AND id NOT IN (
           SELECT id FROM sessions WHERE user_id = ? ORDER BY rowid DESC LIMIT ?)`,
      )
      .bind(userId, userId, MAX_SESSIONS_PER_USER),
  ])
  setSessionCookie(c, token, signature, expiresAt)
}

/**
 * Resolves the signed-in user from the session cookie. Expired or over-age sessions are deleted.
 * Sessions close to expiry are extended, but never past createdAt + 90 days.
 * Returns null when there is no valid session. An account being deleted is treated as signed out
 * unless allowDeleting is set, which only the deletion request itself uses.
 */
export async function loadSession(
  c: Ctx,
  options: { allowDeleting?: boolean } = {},
): Promise<User | null> {
  const token = await verifiedToken(c)
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
  if (row.user.deletingAt !== null && !options.allowDeleting) return null
  if (row.expiresAt - now < SESSION_REFRESH_WITHIN_MS) {
    const expiresAt = Math.min(now + SESSION_TTL_MS, hardEnd)
    if (expiresAt > row.expiresAt) {
      await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id))
      setSessionCookie(c, token, await signToken(c, token), expiresAt)
    }
  }
  return toUser(row.user)
}

/** Deletes the current session row, if the cookie is valid, and clears the cookie. */
export async function endSession(c: Ctx): Promise<void> {
  const token = await verifiedToken(c)
  if (token !== undefined) {
    await c.var.db.delete(sessions).where(eq(sessions.id, await sha256Hex(token)))
  }
  clearSessionCookie(c)
}
