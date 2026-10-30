import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { zValidator } from '@hono/zod-validator'
import { ACCOUNT_SCOPE_HEADER, DevLoginSchema, unitsForAcceptLanguage } from '@rca/contract'
import type { AppEnv } from '../env.ts'
import { HttpError } from '../errors.ts'
import { parseGoogleIdToken } from '../auth/google.ts'
import { buildMe, ensureProfile, signInDev } from '../auth/accounts.ts'
import { hasRefusalPage, refusalPage } from '../auth/refusalPage.ts'
import { signInWithGoogle } from '../auth/signIn.ts'
import { signupGate } from '../auth/signupGate.ts'
import { isLocalRequest } from '../localDev.ts'
import { createSession, endSession, isSecure, loadSession } from '../auth/session.ts'
import { invalidRequest, limitBody } from '../http.ts'
import { toBase64Url, toHex } from '../util.ts'
import { assertAccountScope } from '../middleware.ts'

const STATE_COOKIE = 'rca_oauth_state'
const VERIFIER_COOKIE = 'rca_oauth_verifier'
const OAUTH_COOKIE_PATH = '/api/auth/google'
const OAUTH_COOKIE_MAX_AGE_S = 10 * 60
const DEV_LOGIN_BODY_BYTES = 4 * 1024

export const authRoutes = new Hono<AppEnv>()

function oauthCookieAttributes(c: Parameters<typeof isSecure>[0]) {
  return {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: 'Lax' as const,
    path: OAUTH_COOKIE_PATH,
  }
}

/** Dev-login exists only on the developer's own machine (see isLocalDevelopment). */
const devOnly = createMiddleware<AppEnv>(async (c, next) => {
  if (!isLocalRequest(c)) throw new HttpError(404, 'not_found', 'Not found')
  await next()
})

authRoutes.get('/google', async (c) => {
  const { deps } = c.var
  const state = toHex(deps.randomBytes(32))
  const codeVerifier = toBase64Url(deps.randomBytes(32))
  const url = await deps.google(c.env).authorizationUrl(state, codeVerifier)
  const cookieOptions = { ...oauthCookieAttributes(c), maxAge: OAUTH_COOKIE_MAX_AGE_S }
  setCookie(c, STATE_COOKIE, state, cookieOptions)
  setCookie(c, VERIFIER_COOKIE, codeVerifier, cookieOptions)
  return c.redirect(url.toString(), 302)
})

authRoutes.get('/google/callback', async (c) => {
  const { deps, db } = c.var
  const stateCookie = getCookie(c, STATE_COOKIE)
  const codeVerifier = getCookie(c, VERIFIER_COOKIE)
  // One-shot: the cookies are cleared whatever the outcome. Clearing must repeat the attributes the
  // cookies were set with, or a browser may keep the original cookie.
  deleteCookie(c, STATE_COOKIE, oauthCookieAttributes(c))
  deleteCookie(c, VERIFIER_COOKIE, oauthCookieAttributes(c))

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
  let user
  try {
    user = await signInWithGoogle(db, deps, profile, signupGate(c.env, c.req.url))
  } catch (error) {
    // The browser is mid-navigation, so a refusal the person can act on is a page, not JSON.
    if (error instanceof HttpError && hasRefusalPage(error)) return refusalPage(c, error)
    throw error
  }
  // A new account's profile starts in the units of this sign-in's language; an existing one keeps its own.
  const units = unitsForAcceptLanguage(c.req.header('accept-language'))
  await ensureProfile(db, user.id, deps.now(), units)
  await createSession(c, user.id)
  return c.redirect(c.env.APP_URL, 302)
})

authRoutes.post(
  '/dev-login',
  devOnly,
  limitBody(DEV_LOGIN_BODY_BYTES),
  zValidator('json', DevLoginSchema, (result, c) => {
    if (!result.success) return c.json(invalidRequest(result.error), 400)
  }),
  async (c) => {
    const { deps, db } = c.var
    const row = await signInDev(db, deps, c.req.valid('json'))
    await createSession(c, row.id)
    const me = await buildMe(
      db,
      deps,
      {
        id: row.id,
        email: row.email,
        name: row.name,
        pictureUrl: row.pictureUrl,
      },
      Boolean(c.env.FILES),
      unitsForAcceptLanguage(c.req.header('accept-language')),
    )
    return c.json(me, 200)
  },
)

authRoutes.post('/logout', async (c) => {
  // Keep logout idempotent for an absent/expired session, but do not let an old tab clear a
  // different account's current session after the browser cookie has changed.
  if (c.req.header(ACCOUNT_SCOPE_HEADER) !== undefined) {
    const user = await loadSession(c)
    if (user) assertAccountScope(c, user)
  }
  await endSession(c)
  return c.body(null, 204)
})
