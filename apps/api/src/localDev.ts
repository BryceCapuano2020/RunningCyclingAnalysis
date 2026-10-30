import type { Context } from 'hono'
import type { AppEnv, Bindings } from './env.ts'

/** Hosts that mean "this machine". `URL.hostname` keeps the brackets of an IPv6 literal. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function isLoopbackUrl(value: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(value).hostname)
  } catch {
    return false
  }
}

/**
 * True only when the Worker runs on the developer's own machine: ENVIRONMENT is exactly
 * `development`, APP_URL is a loopback origin, and this request arrived on a loopback host. A
 * public Worker answers on its public host, so a wrong ENVIRONMENT value alone cannot switch on
 * dev-login, skip the rate limits, drop the Secure cookie flag or drop HSTS. Every one of those
 * asks this function, so they open and close together.
 */
export function isLocalDevelopment(env: Bindings, requestUrl: string): boolean {
  return (
    env.ENVIRONMENT === 'development' && isLoopbackUrl(env.APP_URL) && isLoopbackUrl(requestUrl)
  )
}

/** The same decision for a request context. */
export function isLocalRequest(c: Context<AppEnv>): boolean {
  return isLocalDevelopment(c.env, c.req.url)
}
