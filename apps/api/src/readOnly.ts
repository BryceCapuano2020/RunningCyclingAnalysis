import { createMiddleware } from 'hono/factory'
import type { AppEnv } from './env.ts'
import { HttpError } from './errors.ts'

/** What the operator's switch says: on for "true", "1" or "on" in any case, anything else (or unset) is off. */
export function isReadOnly(env: { READ_ONLY?: string }): boolean {
  return ['true', '1', 'on'].includes(
    String(env.READ_ONLY ?? '')
      .trim()
      .toLowerCase(),
  )
}

/** The requests a read-only service still answers although they are not reads: ending one's own session. */
const STILL_ALLOWED = new Set(['/api/auth/logout'])

/** The sign-in callback is a GET that creates a session (and maybe an account), so it is a write too. */
const GET_THAT_WRITES = new Set(['/api/auth/google/callback'])

/**
 * The operator's read-only switch (the plain variable READ_ONLY, see docs/PRODUCTION.md). While it is on, every
 * request that would change an account's data is refused with 503 `read_only` and a message the app shows: saves,
 * profile and measurement changes, uploads, deletes and new sign-ins. Signed-in people keep reading their library. It
 * is for an abuse response or a database restore, where the data must stop moving without taking the service down.
 */
export const readOnlyGuard = createMiddleware<AppEnv>(async (c, next) => {
  if (!isReadOnly(c.env)) return next()
  const safe = ['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && !GET_THAT_WRITES.has(c.req.path)
  if (safe || STILL_ALLOWED.has(c.req.path)) return next()
  throw new HttpError(
    503,
    'read_only',
    'The service is read-only for now, so nothing can be saved or changed. Your analysis still works on this device.',
  )
})
