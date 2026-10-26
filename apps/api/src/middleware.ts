import { createMiddleware } from 'hono/factory'
import type { Context } from 'hono'
import type { User } from '@rca/contract'
import { ACCOUNT_SCOPE_HEADER, CLIENT_HEADER, CLIENT_HEADER_VALUE } from '@rca/contract'
import type { AppEnv } from './env.ts'
import { HttpError } from './errors.ts'
import { loadSession } from './auth/session.ts'
import { accountWriteLimit } from './rateLimit.ts'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Every non-GET /api request must carry the custom header. A cross-site form cannot add it, so
 * this stops CSRF even though the session cookie is sent with same-site requests.
 */
export const csrfGuard = createMiddleware<AppEnv>(async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method) && c.req.header(CLIENT_HEADER) !== CLIENT_HEADER_VALUE) {
    throw new HttpError(403, 'csrf_rejected', `Requests must send ${CLIENT_HEADER}`)
  }
  await next()
})

/**
 * For a GET that spends budget. A cross-site navigation carries the SameSite=Lax session cookie, so
 * without this another site could spend the signed-in user's daily units. Browsers send
 * Sec-Fetch-Site on every request. A request without it (old browsers, curl) is allowed.
 */
export const sameOriginReadGuard = createMiddleware<AppEnv>(async (c, next) => {
  const site = c.req.header('Sec-Fetch-Site')
  if (site !== undefined && site !== 'same-origin' && site !== 'none') {
    throw new HttpError(403, 'csrf_rejected', 'This request must come from the app itself')
  }
  await next()
})

function signedIn(options: { allowDeleting: boolean }) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = await loadSession(c, options)
    if (!user) throw new HttpError(401, 'unauthenticated', 'Sign in required')
    assertAccountScope(c, user)
    c.set('user', user)
    await accountWriteLimit(c, next)
  })
}

/** Requires a live session. An account being deleted reads as signed out. */
export const requireUser = signedIn({ allowDeleting: false })

/**
 * Sets the signed-in user when there is one, and lets a signed-out request through with none. Only
 * GET /api/me uses it: every other account route still requires a session.
 */
export const optionalUser = createMiddleware<AppEnv>(async (c, next) => {
  // Only a read (GET, or HEAD for the same answer) reaches a visitor who may be signed out. Any other
  // method must have a session to act.
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    throw new HttpError(405, 'method_not_allowed', 'This route only reads the session')
  }
  const user = await loadSession(c, { allowDeleting: false })
  if (user) {
    assertAccountScope(c, user)
    c.set('user', user)
  }
  await next()
})

/** Only DELETE /api/me uses this: it lets an interrupted account deletion be retried. */
export const requireUserEvenIfDeleting = signedIn({ allowDeleting: true })

/** Rejects a browser request whose expected account no longer matches its session cookie. */
export function assertAccountScope(c: Context<AppEnv>, user: User): void {
  const expectedUserId = c.req.header(ACCOUNT_SCOPE_HEADER)
  if (expectedUserId !== undefined && expectedUserId !== user.id) {
    throw new HttpError(409, 'account_changed', 'The signed-in account changed; reload the library')
  }
}

/** For handlers behind requireUser: returns the signed-in user. */
export function currentUser(c: Context<AppEnv>): User {
  const user = c.var.user
  if (!user) throw new HttpError(401, 'unauthenticated', 'Sign in required')
  return user
}
