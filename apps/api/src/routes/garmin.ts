import { Hono, type Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import type { AppEnv } from '../env.ts'
import { HttpError, accountDeleting } from '../errors.ts'
import { limitBody } from '../http.ts'
import { isReadOnly } from '../readOnly.ts'
import { currentUser, requireUser } from '../middleware.ts'
import { isSecure, loadSession } from '../auth/session.ts'
import { toBase64Url, toHex } from '../util.ts'
import { garminConfigured, garminEnabled } from '../garmin/flag.ts'
import {
  deregisterQuietly,
  linkOf,
  linksOfGarminUsers,
  removeLink,
  sameToken,
  saveLink,
  tokensOf,
} from '../garmin/link.ts'
import type { GarminGrant } from '../garmin/oauth.ts'

/** Connect, callback, disconnect and Garmin's deregistration notice: docs/design/garmin-sync.md section 5a. */

const STATE_COOKIE = 'rca_garmin_state'
const VERIFIER_COOKIE = 'rca_garmin_verifier'
const COOKIE_PATH = '/api/garmin'
const COOKIE_MAX_AGE_S = 10 * 60
const NOTICE_BODY_BYTES = 64 * 1024

export const garminRoutes = new Hono<AppEnv>()

function cookieAttributes(c: Context<AppEnv>) {
  return { httpOnly: true, secure: isSecure(c), sameSite: 'Lax' as const, path: COOKIE_PATH }
}

function clearConnectCookies(c: Context<AppEnv>): void {
  deleteCookie(c, STATE_COOKIE, cookieAttributes(c))
  deleteCookie(c, VERIFIER_COOKIE, cookieAttributes(c))
}

async function hmacKey(c: Context<AppEnv>): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(c.env.SESSION_SIGNING_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/** What the state cookie's MAC covers: the state, when it was issued and the account that started the connect. */
function bound(userId: string, state: string, issuedAt: string): Uint8Array {
  return new TextEncoder().encode(
    `rca:garmin-connect:v2\u0000${userId}\u0000${state}\u0000${issuedAt}`,
  )
}

/** The state cookie: the state Garmin is sent, its issue time, and a MAC that ties both to this account. */
async function stateCookie(c: Context<AppEnv>, userId: string, state: string): Promise<string> {
  const issuedAt = String(c.var.deps.now())
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(c), bound(userId, state, issuedAt))
  return `${state}.${issuedAt}.${toBase64Url(new Uint8Array(mac))}`
}

/**
 * Whether the cookie names this state for this account, issued within the last ten minutes: the server holds the
 * age, not only the browser's cookie life. The MAC is checked by WebCrypto, in constant time.
 */
async function stateHolds(
  c: Context<AppEnv>,
  cookie: string | undefined,
  userId: string,
  state: string | undefined,
): Promise<boolean> {
  const [value, issuedAt, mac, extra] = (cookie ?? '').split('.')
  if (!value || !issuedAt || !mac || extra !== undefined || value !== state) return false
  if (!/^\d{1,15}$/.test(issuedAt) || !/^[A-Za-z0-9_-]+$/.test(mac)) return false
  const age = c.var.deps.now() - Number(issuedAt)
  if (age < 0 || age > COOKIE_MAX_AGE_S * 1000) return false
  const base64 = mac.replace(/-/g, '+').replace(/_/g, '/')
  let bytes: Uint8Array
  try {
    bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (ch) =>
      ch.charCodeAt(0),
    )
  } catch {
    return false
  }
  return crypto.subtle.verify('HMAC', await hmacKey(c), bytes, bound(userId, state, issuedAt))
}

/** The app's Profile page with the outcome's code: never a message, a token or a Garmin id. */
function profileWith(c: Context<AppEnv>, code: string): string {
  return `${c.env.APP_URL.replace(/\/+$/, '')}/#/profile?garmin=${encodeURIComponent(code)}`
}

function notFound(): HttpError {
  return new HttpError(404, 'not_found', 'Not found')
}

/** Off, connecting is not there at all: a 404 before the session is read, signed in or not. */
const connectingOn = createMiddleware<AppEnv>(async (c, next) => {
  if (!garminEnabled(c.env)) throw notFound()
  await next()
})

function requireConnecting(c: Context<AppEnv>): void {
  if (!garminEnabled(c.env)) throw notFound()
  if (!garminConfigured(c.env)) {
    throw new HttpError(503, 'garmin_unavailable', 'Garmin is not available right now')
  }
}

garminRoutes.get('/connect', connectingOn, requireUser, async (c) => {
  requireConnecting(c)
  const { deps } = c.var
  const state = toHex(deps.randomBytes(32))
  const codeVerifier = toBase64Url(deps.randomBytes(32))
  const url = await deps.garmin(c.env).authorizationUrl(state, codeVerifier)
  const options = { ...cookieAttributes(c), maxAge: COOKIE_MAX_AGE_S }
  // A second connect replaces the first one's cookies, so only the latest state can finish.
  setCookie(c, STATE_COOKIE, await stateCookie(c, currentUser(c).id, state), options)
  setCookie(c, VERIFIER_COOKIE, codeVerifier, options)
  return c.redirect(url.toString(), 302)
})

/** Finishes a connect for the signed-in account that started it. Any refusal is a code on the Profile page. */
async function finishConnect(
  c: Context<AppEnv>,
  cookie: string | undefined,
  verifier: string | undefined,
) {
  if (c.req.query('error'))
    throw new HttpError(400, 'oauth_denied', 'Garmin connection was cancelled')
  // A GET that writes: the read-only switch stops it before the code is spent.
  if (isReadOnly(c.env)) throw new HttpError(503, 'read_only', 'The service is read-only for now')
  const user = await loadSession(c)
  if (!user) throw new HttpError(401, 'unauthenticated', 'Sign in required')
  const state = c.req.query('state')
  if (!verifier || !(await stateHolds(c, cookie, user.id, state))) {
    throw new HttpError(
      400,
      'oauth_state_mismatch',
      'The Garmin connection expired, please try again',
    )
  }
  const code = c.req.query('code')
  if (!code) throw new HttpError(400, 'oauth_missing_code', 'Garmin did not return a code')
  const { deps } = c.var
  let grant: GarminGrant
  try {
    grant = await deps.garmin(c.env).exchangeCode(code, verifier)
  } catch {
    throw new HttpError(502, 'oauth_exchange_failed', 'Could not connect to Garmin')
  }
  const outcome = await saveLink(c.env, deps, user.id, grant)
  if (!outcome.saved) {
    if (outcome.reason === 'deleting') throw accountDeleting()
    throw new HttpError(
      409,
      'garmin_linked_elsewhere',
      'This Garmin account is linked to another account',
    )
  }
  if (outcome.replaced !== null) await deregisterQuietly(c.env, deps, outcome.replaced)
}

garminRoutes.get('/callback', async (c) => {
  // One-shot: the cookies are cleared whatever the outcome, before anything is checked.
  const cookie = getCookie(c, STATE_COOKIE)
  const verifier = getCookie(c, VERIFIER_COOKIE)
  clearConnectCookies(c)
  if (!garminEnabled(c.env)) throw notFound()
  try {
    requireConnecting(c)
    await finishConnect(c, cookie, verifier)
  } catch (error) {
    if (error instanceof HttpError) return c.redirect(profileWith(c, error.code), 302)
    throw error
  }
  return c.redirect(profileWith(c, 'connected'), 302)
})

garminRoutes.delete('/', requireUser, async (c) => {
  const { deps } = c.var
  const userId = currentUser(c).id
  clearConnectCookies(c)
  const link = await linkOf(c.env.DB, userId)
  if (link !== null) {
    await deregisterQuietly(c.env, deps, link)
    await removeLink(c.env, deps.now(), userId)
  }
  return c.body(null, 204)
})

/**
 * Garmin's notice that a user withdrew consent. Garmin's own format and signature are section 9's open questions, so a
 * notice acts only when it carries the link's access token: a forged one cannot unlink an athlete.
 */
const NoticeSchema = z.object({
  deregistrations: z
    .array(
      z.object({
        userId: z.string().min(1).max(128),
        userAccessToken: z.string().min(1).max(4096).optional(),
      }),
    )
    .max(100),
})

garminRoutes.post('/deregistration', limitBody(NOTICE_BODY_BYTES), async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new HttpError(400, 'invalid_request', 'The notice is not JSON')
  }
  const parsed = NoticeSchema.safeParse(body)
  if (!parsed.success)
    throw new HttpError(400, 'invalid_request', 'The notice is not a deregistration')
  let unreadable = false
  const entries = parsed.data.deregistrations.filter((entry) => entry.userAccessToken !== undefined)
  // One read for every link the notice names, so a notice costs one statement however long it is.
  const links = await linksOfGarminUsers(
    c.env.DB,
    entries.map((entry) => entry.userId),
  )
  for (const entry of entries) {
    const link = links.get(entry.userId)
    if (link === undefined || entry.userAccessToken === undefined) continue
    const tokens = await tokensOf(c.env, link)
    // A link whose token cannot be opened (the key dropped) cannot be checked: Garmin is asked to send it again.
    if (tokens === null) {
      unreadable = true
      continue
    }
    if (!sameToken(tokens.accessToken, entry.userAccessToken)) continue
    await removeLink(c.env, c.var.deps.now(), link.userId, link.garminUserId)
  }
  if (unreadable) {
    console.error(JSON.stringify({ event: 'garmin_notice_unreadable_link' }))
    throw new HttpError(503, 'garmin_unavailable', 'Garmin is not available right now')
  }
  // Otherwise Garmin is told it was heard, so it stops sending a notice nothing will act on.
  return c.body(null, 200)
})
