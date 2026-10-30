import type { Context } from 'hono'
import type { AppEnv } from './env.ts'
import type { HttpError } from './errors.ts'

/** The sign-in routes a browser navigates to, so a refusal there is for a person to read, not a script. */
const SIGN_IN_PATHS = new Set(['/api/auth/google', '/api/auth/google/callback'])

/**
 * Whether the request is the browser itself going to a sign-in route: a refusal then lands the person on a
 * blank page of JSON, so they are sent back to the app with the reason instead. A script that asks for the
 * route (no navigation, no HTML accepted) keeps the JSON error.
 */
export function isSignInNavigation(c: Context<AppEnv>): boolean {
  if (c.req.method !== 'GET' || !SIGN_IN_PATHS.has(c.req.path)) return false
  return (
    c.req.header('Sec-Fetch-Mode') === 'navigate' ||
    (c.req.header('Accept') ?? '').includes('text/html')
  )
}

/**
 * The app's home with the reason a sign-in was refused in its hash, such as `#/?signin=rate_limited`. Only the
 * error's code travels, never its message, and the app words each code itself.
 */
export function signInProblemUrl(appUrl: string, error: HttpError): string {
  const base = appUrl.replace(/\/+$/, '')
  return `${base}/#/?signin=${encodeURIComponent(error.code)}`
}
