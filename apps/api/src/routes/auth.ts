import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { zValidator } from '@hono/zod-validator'
import { DevLoginSchema } from '@rca/contract'
import type { AppEnv } from '../env.ts'
import { HttpError } from '../errors.ts'
import { parseGoogleIdToken } from '../auth/google.ts'
import { buildMe, signInDev, signInWithGoogle } from '../auth/accounts.ts'
import { createSession, endSession, isSecure } from '../auth/session.ts'
import { invalidRequest } from '../http.ts'
import { toBase64Url, toHex } from '../util.ts'

const STATE_COOKIE = 'rca_oauth_state'
const VERIFIER_COOKIE = 'rca_oauth_verifier'
const OAUTH_COOKIE_PATH = '/api/auth/google'
const OAUTH_COOKIE_MAX_AGE_S = 10 * 60

export const authRoutes = new Hono<AppEnv>()

const devOnly = createMiddleware<AppEnv>(async (c, next) => {
  if (c.env.ENVIRONMENT !== 'development') throw new HttpError(404, 'not_found', 'Not found')
  await next()
})

authRoutes.get('/google', async (c) => {
  const { deps } = c.var
  const state = toHex(deps.randomBytes(32))
  const codeVerifier = toBase64Url(deps.randomBytes(32))
  const url = await deps.google(c.env).authorizationUrl(state, codeVerifier)
  const cookieOptions = {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: 'Lax' as const,
    path: OAUTH_COOKIE_PATH,
    maxAge: OAUTH_COOKIE_MAX_AGE_S,
  }
  setCookie(c, STATE_COOKIE, state, cookieOptions)
  setCookie(c, VERIFIER_COOKIE, codeVerifier, cookieOptions)
  return c.redirect(url.toString(), 302)
})

authRoutes.get('/google/callback', async (c) => {
  const { deps, db } = c.var
  const stateCookie = getCookie(c, STATE_COOKIE)
  const codeVerifier = getCookie(c, VERIFIER_COOKIE)
  // One-shot: the cookies are cleared whatever the outcome.
  deleteCookie(c, STATE_COOKIE, { path: OAUTH_COOKIE_PATH })
  deleteCookie(c, VERIFIER_COOKIE, { path: OAUTH_COOKIE_PATH })

  if (c.req.query('error')) throw new HttpError(400, 'oauth_denied', 'Google sign-in was cancelled')
  const state = c.req.query('state')
  if (!stateCookie || !codeVerifier || state !== stateCookie) {
    throw new HttpError(400, 'oauth_state_mismatch', 'Sign-in expired, please try again')
  }
  const code = c.req.query('code')
  if (!code) throw new HttpError(400, 'oauth_missing_code', 'Google did not return a code')

  let idToken: string
  try {
    idToken = await deps.google(c.env).exchangeCode(code, codeVerifier)
  } catch {
    throw new HttpError(502, 'oauth_exchange_failed', 'Could not complete sign-in with Google')
  }

  const profile = parseGoogleIdToken(idToken, c.env.GOOGLE_CLIENT_ID, deps.now())
  const user = await signInWithGoogle(db, deps, profile)
  await createSession(c, user.id)
  return c.redirect(c.env.APP_URL, 302)
})

authRoutes.post(
  '/dev-login',
  devOnly,
  zValidator('json', DevLoginSchema, (result, c) => {
    if (!result.success) return c.json(invalidRequest(result.error), 400)
  }),
  async (c) => {
    const { deps, db } = c.var
    const row = await signInDev(db, deps, c.req.valid('json'))
    await createSession(c, row.id)
    const me = await buildMe(db, deps, {
      id: row.id,
      email: row.email,
      name: row.name,
      pictureUrl: row.pictureUrl,
    })
    return c.json(me, 200)
  },
)

authRoutes.post('/logout', async (c) => {
  await endSession(c)
  return c.body(null, 204)
})
