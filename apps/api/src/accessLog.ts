import type { MiddlewareHandler } from 'hono'
import { matchedRoutes } from 'hono/route'
import type { AppEnv } from './env.ts'

/** What an unmatched request is logged as: its raw path can hold an id or a probe's text. */
export const UNMATCHED_ROUTE = 'unmatched'

/**
 * The pattern of the route that answered, such as `/api/activities/:id`, never the path that was
 * requested. Middleware registers as ALL and a not-found has no handler of its own.
 */
export function routePattern(matched: readonly { method: string; path: string }[]): string {
  for (let i = matched.length - 1; i >= 0; i--) {
    const route = matched[i]!
    if (route.method !== 'ALL') return route.path
  }
  return UNMATCHED_ROUTE
}

const KNOWN_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])

/** A request slower than this is always logged, whatever its status. */
export const SLOW_REQUEST_MS = 1_000

/** One successful request in this many is logged: Workers Logs has a daily cap on the Free plan. */
export const SUCCESS_SAMPLE_EVERY = 10

/** The method as logged: a known verb, else `OTHER`, so a probe's made-up verb is not written down. */
export function loggedMethod(method: string): string {
  return KNOWN_METHODS.has(method) ? method : 'OTHER'
}

/**
 * Whether a successful request is in the sample: decided by its request id, so it is deterministic
 * and a request id from a user's report is either always or never in the logs. A random UUID's first
 * eight hex digits are uniform.
 */
export function inSuccessSample(requestId: string | null): boolean {
  const bucket = Number.parseInt((requestId ?? '').slice(0, 8), 16)
  return Number.isFinite(bucket) && bucket % SUCCESS_SAMPLE_EVERY === 0
}

/**
 * One JSON line per request: method, route pattern, status, duration and the request id the response
 * carries in X-Request-ID. Nothing else: no path, query, headers, cookies, address, user or body, so
 * the line holds no personal data and needs no redaction. Register it after the middleware that sets
 * the request id and before the rate limiter, so a rejected request is logged too.
 *
 * To stay well inside the Workers Logs cap, every response outside 2xx and every request slower than
 * SLOW_REQUEST_MS is logged, and a 2xx one in SUCCESS_SAMPLE_EVERY. `duration_ms` is wall time as the
 * Workers clock reports it, which only advances at I/O, so a request that only computes reads 0.
 */
export const accessLog: MiddlewareHandler<AppEnv> = async (c, next) => {
  const started = c.get('deps').now()
  await next()
  const durationMs = Math.max(0, c.get('deps').now() - started)
  const requestId = c.res.headers.get('X-Request-ID')
  const ok = c.res.status >= 200 && c.res.status < 300
  if (ok && durationMs <= SLOW_REQUEST_MS && !inSuccessSample(requestId)) return
  console.log(
    JSON.stringify({
      event: 'api_request',
      method: loggedMethod(c.req.method),
      route: routePattern(matchedRoutes(c)),
      status: c.res.status,
      duration_ms: durationMs,
      request_id: requestId,
    }),
  )
}
