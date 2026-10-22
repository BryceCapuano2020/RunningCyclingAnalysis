import { createMiddleware } from 'hono/factory'
import type { AppEnv } from './env.ts'
import { HttpError } from './errors.ts'

/** Bindings use 60-second windows. Limits are approximate per Cloudflare location, not quotas. */
async function admit(limiter: RateLimit | undefined, key: string): Promise<void> {
  if (!limiter)
    throw new HttpError(503, 'service_unavailable', 'Service is temporarily unavailable')
  let success: boolean
  try {
    success = (await limiter.limit({ key })).success
  } catch {
    throw new HttpError(503, 'service_unavailable', 'Service is temporarily unavailable')
  }
  if (!success)
    throw new HttpError(429, 'rate_limited', 'Too many requests. Please try again shortly')
}

/** Only Cloudflare's edge-supplied address is used; client forwarding headers are not trusted. */
export const publicRateLimit = createMiddleware<AppEnv>(async (c, next) => {
  if (c.env.ENVIRONMENT === 'development') return next()
  const address = c.req.header('CF-Connecting-IP') ?? 'unknown'
  c.header('Retry-After', '60')
  await admit(c.env.API_RATE_LIMITER, `ip:${address}`)
  if (c.req.path.startsWith('/api/auth/') && c.req.path !== '/api/auth/logout') {
    await admit(c.env.AUTH_RATE_LIMITER, `auth:${address}`)
  }
  c.res.headers.delete('Retry-After')
  await next()
})

/** Account writes share one stable user key, rather than being bypassable with many sessions. */
export const accountWriteLimit = createMiddleware<AppEnv>(async (c, next) => {
  if (c.env.ENVIRONMENT === 'development' || ['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    return next()
  }
  const user = c.var.user
  if (!user) throw new HttpError(401, 'unauthenticated', 'Sign in required')
  c.header('Retry-After', '60')
  await admit(c.env.WRITE_RATE_LIMITER, `user:${user.id}`)
  c.res.headers.delete('Retry-After')
  await next()
})
