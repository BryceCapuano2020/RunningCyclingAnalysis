import { describe, expect, it } from 'vitest'
import {
  createHarness,
  fakeGoogle,
  fakeIdToken,
  googleClaims,
  sessionCookie,
  sha256Token,
  START,
} from '../test/harness.ts'

/** Runs the start step and returns the state and verifier cookies it set. */
async function startSignIn(h: ReturnType<typeof createHarness>) {
  const res = await h.send({ path: '/api/auth/google' })
  const cookies = res.headers.getSetCookie()
  const pick = (name: string) => {
    const line = cookies.find((c) => c.startsWith(`${name}=`))
    const value = line?.slice(name.length + 1).split(';')[0]
    if (!value) throw new Error(`${name} cookie missing`)
    return value
  }
  return { res, state: pick('rca_oauth_state'), verifier: pick('rca_oauth_verifier'), cookies }
}

function callbackParams(state: string, code = 'code-1'): string {
  return `/api/auth/google/callback?state=${state}&code=${code}`
}

describe('GET /api/auth/google', () => {
  it('redirects to Google and sets short-lived HttpOnly state and verifier cookies', async () => {
    const h = createHarness()
    const { res, state, verifier, cookies } = await startSignIn(h)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(
      `https://accounts.google.test/o/oauth2/v2/auth?state=${state}`,
    )
    expect(state).toHaveLength(64)
    expect(verifier).toHaveLength(43)
    for (const cookie of cookies) {
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('SameSite=Lax')
      expect(cookie).toContain('Path=/api/auth/google')
      expect(cookie).toContain('Max-Age=600')
      expect(cookie).not.toContain('Secure')
    }
  })

  it('marks the cookies Secure outside development', async () => {
    const h = createHarness({}, { ENVIRONMENT: 'production' })
    const { cookies } = await startSignIn(h)
    expect(cookies.every((c) => c.includes('Secure'))).toBe(true)
  })
})

describe('GET /api/auth/google/callback', () => {
  const idToken = fakeIdToken(googleClaims())

  it('creates the user, default profile and session, then redirects to the app', async () => {
    const google = fakeGoogle({ idToken })
    const h = createHarness({ google: () => google })
    const { state, verifier } = await startSignIn(h)

    const res = await h.send({
      path: callbackParams(state),
      cookies: { rca_oauth_state: state, rca_oauth_verifier: verifier },
    })

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('http://localhost:5183')
    expect(google.exchanges).toEqual([{ code: 'code-1', codeVerifier: verifier }])

    const token = sessionCookie(res)
    expect(token).toBeTruthy()
    const me = await h.send({ path: '/api/me', cookies: { rca_session: token ?? '' } })
    expect(await me.json()).toEqual({
      user: {
        id: expect.any(String),
        email: 'rider@example.com',
        name: 'Rider Example',
        pictureUrl: 'https://lh3.example.test/photo.jpg',
      },
      profile: {
        massKg: null,
        bikeMassKg: 9,
        units: 'metric',
        keepFiles: false,
        birthYear: null,
        sex: null,
        updatedAt: h.clock.now,
      },
      fileRetentionAvailable: true,
    })
    const cleared = res.headers.getSetCookie().filter((c) => c.startsWith('rca_oauth_'))
    expect(cleared).toHaveLength(2)
    expect(cleared.every((c) => c.includes('Max-Age=0'))).toBe(true)
  })

  it('stores the session token only as its hash', async () => {
    const h = createHarness({ google: () => fakeGoogle({ idToken }) })
    const { state, verifier } = await startSignIn(h)
    const res = await h.send({
      path: callbackParams(state),
      cookies: { rca_oauth_state: state, rca_oauth_verifier: verifier },
    })
    const token = sessionCookie(res) ?? ''
    const row = await h.env.DB.prepare('SELECT id FROM sessions').first<{ id: string }>()
    expect(row?.id).toBe(await sha256Token(token))
  })

  it('updates the name and picture of a returning Google user without duplicating them', async () => {
    let google = fakeGoogle({ idToken })
    const h = createHarness({ google: () => google })
    const first = await startSignIn(h)
    await h.send({
      path: callbackParams(first.state),
      cookies: { rca_oauth_state: first.state, rca_oauth_verifier: first.verifier },
    })

    google = fakeGoogle({
      idToken: fakeIdToken(googleClaims({ name: 'New Name', picture: undefined })),
    })
    const second = await startSignIn(h)
    const res = await h.send({
      path: callbackParams(second.state),
      cookies: { rca_oauth_state: second.state, rca_oauth_verifier: second.verifier },
    })
    expect(res.status).toBe(302)
    const me = await h.send({ path: '/api/me', cookies: { rca_session: sessionCookie(res) ?? '' } })
    expect(await me.json()).toMatchObject({ user: { name: 'New Name', pictureUrl: null } })
    expect(
      await h.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>(),
    ).toEqual({ n: 1 })
  })

  it('links a verified Google login to an existing user with the same email', async () => {
    const h = createHarness({ google: () => fakeGoogle({ idToken }) })
    await h.signIn('rider@example.com', 'Dev Rider')
    const { state, verifier } = await startSignIn(h)
    const res = await h.send({
      path: callbackParams(state),
      cookies: { rca_oauth_state: state, rca_oauth_verifier: verifier },
    })
    expect(res.status).toBe(302)
    expect(
      await h.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>(),
    ).toEqual({ n: 1 })
    expect(
      await h.env.DB.prepare('SELECT COUNT(*) AS n FROM oauth_accounts WHERE provider_user_id = ?')
        .bind('google-sub-1')
        .first<{ n: number }>(),
    ).toEqual({ n: 1 })
  })

  it('omits the Secure flag on the session cookie in development and sets it in production', async () => {
    const dev = createHarness({ google: () => fakeGoogle({ idToken }) })
    const devStart = await startSignIn(dev)
    const devRes = await dev.send({
      path: callbackParams(devStart.state),
      cookies: { rca_oauth_state: devStart.state, rca_oauth_verifier: devStart.verifier },
    })
    const devSession = devRes.headers.getSetCookie().find((c) => c.startsWith('rca_session='))
    expect(devSession).toContain('HttpOnly')
    expect(devSession).not.toContain('Secure')

    const prod = createHarness(
      { google: () => fakeGoogle({ idToken }) },
      { ENVIRONMENT: 'production' },
    )
    const prodStart = await startSignIn(prod)
    const prodRes = await prod.send({
      path: callbackParams(prodStart.state),
      cookies: { rca_oauth_state: prodStart.state, rca_oauth_verifier: prodStart.verifier },
    })
    const prodSession = prodRes.headers
      .getSetCookie()
      .find((c) => c.startsWith('__Host-rca_session='))
    expect(prodSession).toContain('Secure')
    expect(prodSession).toContain('SameSite=Lax')
    expect(prodSession).toContain('Path=/')
    expect(prodSession).not.toContain('Domain')
  })

  it('clears the OAuth cookies on an error return with the attributes they were set with', async () => {
    const h = createHarness({}, { ENVIRONMENT: 'production' })
    const { state, verifier } = await startSignIn(h)
    const res = await h.send({
      path: `/api/auth/google/callback?error=access_denied&state=${state}`,
      cookies: { rca_oauth_state: state, rca_oauth_verifier: verifier },
    })
    expect(res.status).toBe(400)
    const cleared = res.headers.getSetCookie().filter((c) => c.startsWith('rca_oauth_'))
    expect(cleared).toHaveLength(2)
    for (const cookie of cleared) {
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('Secure')
      expect(cookie).toContain('SameSite=Lax')
      expect(cookie).toContain('Path=/api/auth/google')
    }
  })

  it('clears the OAuth cookies on a state mismatch with the same attributes', async () => {
    const h = createHarness({}, { ENVIRONMENT: 'production' })
    const res = await h.send({
      path: '/api/auth/google/callback?state=wrong&code=c',
      cookies: { rca_oauth_state: 'right', rca_oauth_verifier: 'v' },
    })
    expect(res.status).toBe(400)
    for (const cookie of res.headers.getSetCookie().filter((c) => c.startsWith('rca_oauth_'))) {
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('Secure')
      expect(cookie).toContain('SameSite=Lax')
      expect(cookie).toContain('Path=/api/auth/google')
    }
  })

  it('refuses to sign in to an account that is being deleted', async () => {
    const h = createHarness({}, { ENVIRONMENT: 'development' })
    await h.signIn('rider@example.com', 'Rider')
    await h.env.DB.prepare('UPDATE users SET deleting_at = ?').bind(START).run()
    const res = await h.send({
      method: 'POST',
      path: '/api/auth/dev-login',
      json: { email: 'rider@example.com', name: 'Rider' },
    })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: { code: 'account_deleting' } })
  })

  it('rejects a callback whose state does not match the cookie', async () => {
    const h = createHarness({ google: () => fakeGoogle({ idToken }) })
    const { verifier, state } = await startSignIn(h)
    const res = await h.send({
      path: callbackParams('attacker-state'),
      cookies: { rca_oauth_state: state, rca_oauth_verifier: verifier },
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'oauth_state_mismatch' } })
    expect(res.headers.getSetCookie().filter((c) => c.startsWith('rca_oauth_'))).toHaveLength(2)
  })

  it('refuses to link a Google login to an account that already has a different Google identity', async () => {
    let google = fakeGoogle({ idToken: fakeIdToken(googleClaims({ sub: 'other-google-sub' })) })
    const h = createHarness({ google: () => google })
    const first = await startSignIn(h)
    await h.send({
      path: callbackParams(first.state),
      cookies: { rca_oauth_state: first.state, rca_oauth_verifier: first.verifier },
    })

    google = fakeGoogle({ idToken })
    const second = await startSignIn(h)
    const res = await h.send({
      path: callbackParams(second.state),
      cookies: { rca_oauth_state: second.state, rca_oauth_verifier: second.verifier },
    })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({
      error: {
        code: 'account_conflict',
        message: expect.stringContaining('different Google account'),
      },
    })
    expect(sessionCookie(res)).toBeUndefined()
    expect(
      await h.env.DB.prepare('SELECT COUNT(*) AS n FROM oauth_accounts').first<{ n: number }>(),
    ).toEqual({ n: 1 })
    expect(
      await h.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>(),
    ).toEqual({ n: 1 })
  })

  it('allows only one Google identity to link when callbacks race for the same email', async () => {
    const google = {
      authorizationUrl: async (state: string) =>
        new URL(`https://accounts.google.test/o/oauth2/v2/auth?state=${state}`),
      exchangeCode: async (code: string) => fakeIdToken(googleClaims({ sub: `google-${code}` })),
    }
    const h = createHarness({ google: () => google })
    await h.signIn('rider@example.com', 'Dev Rider')
    const first = await startSignIn(h)
    const second = await startSignIn(h)

    const [one, two] = await Promise.all([
      h.send({
        path: callbackParams(first.state, 'one'),
        cookies: { rca_oauth_state: first.state, rca_oauth_verifier: first.verifier },
      }),
      h.send({
        path: callbackParams(second.state, 'two'),
        cookies: { rca_oauth_state: second.state, rca_oauth_verifier: second.verifier },
      }),
    ])
    expect([one.status, two.status].sort()).toEqual([302, 409])
    expect(
      await h.env.DB.prepare(
        'SELECT COUNT(*) AS n FROM oauth_accounts WHERE user_id = (SELECT id FROM users WHERE email = ?)',
      )
        .bind('rider@example.com')
        .first<{ n: number }>(),
    ).toEqual({ n: 1 })
  })

  it('rejects a callback with no state cookie', async () => {
    const h = createHarness({ google: () => fakeGoogle({ idToken }) })
    const res = await h.send({ path: callbackParams('s') })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'oauth_state_mismatch' } })
  })

  it('reports a cancelled consent screen', async () => {
    const h = createHarness({ google: () => fakeGoogle({ idToken }) })
    const res = await h.send({ path: '/api/auth/google/callback?error=access_denied&state=s' })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'oauth_denied' } })
  })

  it('requires an authorization code', async () => {
    const h = createHarness({ google: () => fakeGoogle({ idToken }) })
    const { state, verifier } = await startSignIn(h)
    const res = await h.send({
      path: `/api/auth/google/callback?state=${state}`,
      cookies: { rca_oauth_state: state, rca_oauth_verifier: verifier },
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'oauth_missing_code' } })
  })

  it('returns 502 when the code exchange fails', async () => {
    const h = createHarness({ google: () => fakeGoogle({ fail: true }) })
    const { state, verifier } = await startSignIn(h)
    const res = await h.send({
      path: callbackParams(state),
      cookies: { rca_oauth_state: state, rca_oauth_verifier: verifier },
    })
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ error: { code: 'oauth_exchange_failed' } })
  })

  it('does not sign in when the ID token is not verified', async () => {
    const unverified = fakeIdToken(googleClaims({ email_verified: false }))
    const h = createHarness({ google: () => fakeGoogle({ idToken: unverified }) })
    const { state, verifier } = await startSignIn(h)
    const res = await h.send({
      path: callbackParams(state),
      cookies: { rca_oauth_state: state, rca_oauth_verifier: verifier },
    })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: { code: 'email_not_verified' } })
    expect(sessionCookie(res)).toBeUndefined()
    expect(
      await h.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>(),
    ).toEqual({ n: 0 })
  })

  it('does not sign in on a malformed ID token', async () => {
    const h = createHarness({ google: () => fakeGoogle({ idToken: 'garbage' }) })
    const { state, verifier } = await startSignIn(h)
    const res = await h.send({
      path: callbackParams(state),
      cookies: { rca_oauth_state: state, rca_oauth_verifier: verifier },
    })
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ error: { code: 'oauth_bad_id_token' } })
  })
})

describe('new account units from the sign-in language', () => {
  it('starts a new dev-login account in the units of the request language', async () => {
    const h = createHarness()
    const british = await h.send({
      method: 'POST',
      path: '/api/auth/dev-login',
      json: { email: 'uk@example.com', name: 'Uk' },
      headers: { 'accept-language': 'en-GB,en;q=0.9' },
    })
    expect(await british.json()).toMatchObject({ profile: { units: 'metric' } })
    const american = await h.send({
      method: 'POST',
      path: '/api/auth/dev-login',
      json: { email: 'us@example.com', name: 'Us' },
      headers: { 'accept-language': 'en-US,en;q=0.9' },
    })
    expect(await american.json()).toMatchObject({ profile: { units: 'imperial' } })
  })

  it('starts a new dev-login account in metric when the request has no language', async () => {
    const h = createHarness()
    const res = await h.send({
      method: 'POST',
      path: '/api/auth/dev-login',
      json: { email: 'none@example.com', name: 'None' },
    })
    expect(await res.json()).toMatchObject({ profile: { units: 'metric' } })
  })

  it('starts a new Google account in the units of the sign-in callback language', async () => {
    const google = fakeGoogle({ idToken: fakeIdToken(googleClaims()) })
    const h = createHarness({ google: () => google })
    const { state, verifier } = await startSignIn(h)
    const res = await h.send({
      path: callbackParams(state),
      cookies: { rca_oauth_state: state, rca_oauth_verifier: verifier },
      headers: { 'accept-language': 'en-US,en;q=0.9' },
    })
    const token = sessionCookie(res) ?? ''
    const me = await h.send({ path: '/api/me', cookies: { rca_session: token } })
    expect(await me.json()).toMatchObject({ profile: { units: 'imperial' } })
  })

  it('does not change the units of an account that already has a profile', async () => {
    const h = createHarness()
    const first = await h.send({
      method: 'POST',
      path: '/api/auth/dev-login',
      json: { email: 'kept@example.com', name: 'Kept' },
      headers: { 'accept-language': 'en-US,en;q=0.9' },
    })
    expect(await first.json()).toMatchObject({ profile: { units: 'imperial' } })
    const again = await h.send({
      method: 'POST',
      path: '/api/auth/dev-login',
      json: { email: 'kept@example.com', name: 'Kept' },
      headers: { 'accept-language': 'en-GB,en;q=0.9' },
    })
    expect(await again.json()).toMatchObject({ profile: { units: 'imperial' } })
  })
})

describe('POST /api/auth/dev-login', () => {
  it('signs in a local user, lower-casing the email, and returns Me', async () => {
    const h = createHarness()
    const res = await h.send({
      method: 'POST',
      path: '/api/auth/dev-login',
      json: { email: 'Dev@Example.com', name: '  Dev  ' },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      user: { email: 'dev@example.com', name: 'Dev', pictureUrl: null },
      profile: { massKg: null, bikeMassKg: 9, units: 'metric', keepFiles: false },
      fileRetentionAvailable: true,
    })
    expect(sessionCookie(res)).toBeTruthy()
  })

  it('reuses the user and refreshes the name when the email is already known', async () => {
    const h = createHarness()
    await h.signIn('dev@example.com', 'First')
    const res = await h.send({
      method: 'POST',
      path: '/api/auth/dev-login',
      json: { email: 'dev@example.com', name: 'Second' },
    })
    expect(await res.json()).toMatchObject({ user: { name: 'Second' } })
    expect(
      await h.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>(),
    ).toEqual({ n: 1 })
  })

  it('rejects an invalid email or name with 400', async () => {
    const h = createHarness()
    const bad = [
      { email: 'not-an-email', name: 'x' },
      { email: 'a@b.co', name: '   ' },
      { email: 'a@b.co' },
    ]
    for (const json of bad) {
      const res = await h.send({ method: 'POST', path: '/api/auth/dev-login', json })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: { code: 'invalid_request' } })
    }
  })

  it('rejects a body that is not JSON with 400', async () => {
    const h = createHarness()
    const res = await h.send({
      method: 'POST',
      path: '/api/auth/dev-login',
      headers: { 'content-type': 'application/json' },
      raw: new TextEncoder().encode('{nope'),
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'invalid_request' } })
  })

  it.each<string | undefined>([undefined, '', 'production', 'Development', 'dev', 'development '])(
    'does not exist when ENVIRONMENT is %j',
    async (environment) => {
      const h = createHarness({}, { ENVIRONMENT: environment })
      const res = await h.send({
        method: 'POST',
        path: '/api/auth/dev-login',
        json: { email: 'a@b.co', name: 'A' },
      })
      expect(res.status).toBe(404)
      expect(
        await h.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>(),
      ).toEqual({ n: 0 })
    },
  )

  it('keeps cookies Secure when ENVIRONMENT is unset', async () => {
    const h = createHarness({}, { ENVIRONMENT: undefined })
    const res = await h.send({ path: '/api/auth/google' })
    expect(res.headers.getSetCookie().every((c) => c.includes('Secure'))).toBe(true)
  })

  it('does not exist outside development', async () => {
    const h = createHarness({}, { ENVIRONMENT: 'production' })
    const res = await h.send({
      method: 'POST',
      path: '/api/auth/dev-login',
      json: { email: 'a@b.co', name: 'A' },
    })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } })
    expect(
      await h.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>(),
    ).toEqual({ n: 0 })
  })
})
