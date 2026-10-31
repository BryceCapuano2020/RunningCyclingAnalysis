import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { drizzle } from 'drizzle-orm/d1'
import { apiError, HttpError } from './errors.ts'
import { systemDeps, type Deps } from './deps.ts'
import { schema } from './db/schema.ts'
import type { AppEnv } from './env.ts'
import { csrfGuard } from './middleware.ts'
import { authRoutes } from './routes/auth.ts'
import { meRoutes } from './routes/me.ts'
import { sessionRoutes } from './routes/sessions.ts'
import { measurementRoutes } from './routes/measurements.ts'
import { activityRoutes } from './routes/activities/index.ts'
import { publicRateLimit } from './rateLimit.ts'
import { isSignInNavigation, signInProblemUrl } from './signInProblem.ts'
import { healthRoutes } from './routes/health.ts'
import { BUILD_SHA } from './buildInfo.ts'
import { accessLog } from './accessLog.ts'
import { isLocalRequest } from './localDev.ts'

/** Builds the API. Overrides replace the clock, randomness and OAuth client (tests). */
export function createApp(overrides: Partial<Deps> = {}): Hono<AppEnv> {
  const deps: Deps = { ...systemDeps, ...overrides }
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('deps', deps)
    c.set('db', drizzle(c.env.DB, { schema }))
    c.set('user', null)
    await next()
  })
  app.use('*', async (c, next) => {
    const requestId = crypto.randomUUID()
    c.header('X-Request-ID', requestId)
    await next()
    c.res.headers.set('X-Content-Type-Options', 'nosniff')
    if (!c.res.headers.has('Cache-Control')) c.res.headers.set('Cache-Control', 'no-store')
    c.res.headers.set('Referrer-Policy', 'no-referrer')
    if (c.req.path.startsWith('/api/')) {
      c.res.headers.set('Cross-Origin-Resource-Policy', 'same-origin')
    }
    c.res.headers.set('X-Frame-Options', 'DENY')
    c.res.headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
    if (!isLocalRequest(c)) {
      c.res.headers.set('Strict-Transport-Security', 'max-age=31536000')
    }
  })
  app.use('*', accessLog)
  app.use('/api/*', publicRateLimit)
  app.use('/api/*', csrfGuard)

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      // A person whose sign-in is refused is sent back to the app with the reason, not left on raw JSON.
      if (isSignInNavigation(c)) return c.redirect(signInProblemUrl(c.env.APP_URL, err), 302)
      if (err.retryAfter !== undefined) c.header('Retry-After', String(err.retryAfter))
      return c.json(apiError(err.code, err.message), err.status)
    }
    if (err instanceof HTTPException) {
      return c.json(
        apiError(err.status === 400 ? 'invalid_request' : 'http_error', err.message),
        err.status,
      )
    }
    // Request bodies, URL queries, tokens and database error messages can contain personal data.
    // Log only a correlation id and the exception class; return the id in every response.
    console.error(
      JSON.stringify({
        event: 'api_unexpected_error',
        requestId: c.res.headers.get('X-Request-ID'),
        errorClass: err.constructor.name,
      }),
    )
    return c.json(apiError('internal_error', 'Something went wrong'), 500)
  })
  app.notFound((c) => {
    // Missing hashed assets are plain 404s: an HTML or JSON body would hide a broken build.
    if (c.req.path.startsWith('/assets/')) {
      return c.text('Not found', 404, { 'Cache-Control': 'no-store' })
    }
    return c.json(apiError('not_found', 'Not found'), 404)
  })

  app.get('/api/health', (c) => c.json({ status: 'ok', sha: BUILD_SHA }, 200))
  app.route('/api/health', healthRoutes)
  app.route('/api/auth', authRoutes)
  app.route('/api', meRoutes)
  app.route('/api/sessions', sessionRoutes)
  app.route('/api/measurements', measurementRoutes)
  app.route('/api/activities', activityRoutes)

  return app
}
