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

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const user = await loadSession(c)
  if (!user) throw new HttpError(401, 'unauthenticated', 'Sign in required')
  assertAccountScope(c, user)
  c.set('user', user)
  await accountWriteLimit(c, next)
})

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
