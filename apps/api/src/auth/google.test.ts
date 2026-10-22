import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '../errors.ts'
import { fakeIdToken, googleClaims, TEST_CLIENT_ID, START } from '../test/harness.ts'
import { createGoogleOAuth, parseGoogleIdToken, pkceChallenge } from './google.ts'

const env = {
  DB: {} as D1Database,
  FILES: {} as R2Bucket,
  ENVIRONMENT: 'development',
  APP_URL: 'http://localhost:5183',
  GOOGLE_CLIENT_ID: TEST_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: 'secret',
}

function expectHttpError(fn: () => unknown, status: number, code: string): void {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status, code })
    return
  }
  throw new Error('expected an HttpError')
}

describe('parseGoogleIdToken', () => {
  it('reads the profile, lower-casing the email and trimming the name', () => {
    const token = fakeIdToken(googleClaims({ name: '  Zoë Rider  ' }))
    expect(parseGoogleIdToken(token, TEST_CLIENT_ID, START)).toEqual({
      sub: 'google-sub-1',
      email: 'rider@example.com',
      name: 'Zoë Rider',
      pictureUrl: 'https://lh3.example.test/photo.jpg',
    })
  })

  it('falls back to the email local part when the name is missing or blank', () => {
    const missing = fakeIdToken(googleClaims({ name: undefined }))
    expect(parseGoogleIdToken(missing, TEST_CLIENT_ID, START).name).toBe('Rider')
    const blank = fakeIdToken(googleClaims({ name: '   ' }))
    expect(parseGoogleIdToken(blank, TEST_CLIENT_ID, START).name).toBe('Rider')
  })

  it('returns a null picture when the token has none', () => {
    const token = fakeIdToken(googleClaims({ picture: undefined }))
    expect(parseGoogleIdToken(token, TEST_CLIENT_ID, START).pictureUrl).toBeNull()
  })

  it('accepts the bare issuer and an audience list that contains the client', () => {
    const bare = fakeIdToken(googleClaims({ iss: 'accounts.google.com' }))
    expect(parseGoogleIdToken(bare, TEST_CLIENT_ID, START).sub).toBe('google-sub-1')
    const list = fakeIdToken(googleClaims({ aud: ['other', TEST_CLIENT_ID] }))
    expect(parseGoogleIdToken(list, TEST_CLIENT_ID, START).sub).toBe('google-sub-1')
  })

  it('rejects a token without three segments', () => {
    expectHttpError(
      () => parseGoogleIdToken('abc.def', TEST_CLIENT_ID, START),
      502,
      'oauth_bad_id_token',
    )
    expectHttpError(() => parseGoogleIdToken('', TEST_CLIENT_ID, START), 502, 'oauth_bad_id_token')
  })

  it('rejects a payload that is not base64url JSON', () => {
    expectHttpError(
      () => parseGoogleIdToken('h.!!!.s', TEST_CLIENT_ID, START),
      502,
      'oauth_bad_id_token',
    )
    expectHttpError(
      () => parseGoogleIdToken(`h.${btoa('not json')}.s`, TEST_CLIENT_ID, START),
      502,
      'oauth_bad_id_token',
    )
  })

  it('rejects claims that fail the schema', () => {
    const { sub: _sub, ...withoutSub } = googleClaims()
    expectHttpError(
      () => parseGoogleIdToken(fakeIdToken(withoutSub), TEST_CLIENT_ID, START),
      502,
      'oauth_bad_id_token',
    )
    expectHttpError(
      () =>
        parseGoogleIdToken(
          fakeIdToken(googleClaims({ email: 'not-an-email' })),
          TEST_CLIENT_ID,
          START,
        ),
      502,
      'oauth_bad_id_token',
    )
  })

  it('rejects an issuer other than Google', () => {
    const token = fakeIdToken(googleClaims({ iss: 'https://evil.example' }))
    expectHttpError(
      () => parseGoogleIdToken(token, TEST_CLIENT_ID, START),
      502,
      'oauth_bad_id_token',
    )
  })

  it('rejects a token issued to another client', () => {
    const token = fakeIdToken(googleClaims({ aud: 'someone-else' }))
    expectHttpError(
      () => parseGoogleIdToken(token, TEST_CLIENT_ID, START),
      502,
      'oauth_bad_id_token',
    )
  })

  it('rejects an expired token', () => {
    const token = fakeIdToken(googleClaims({ exp: START / 1000 }))
    expectHttpError(
      () => parseGoogleIdToken(token, TEST_CLIENT_ID, START),
      400,
      'oauth_token_expired',
    )
  })

  it('rejects an unverified email', () => {
    const token = fakeIdToken(googleClaims({ email_verified: false }))
    expectHttpError(
      () => parseGoogleIdToken(token, TEST_CLIENT_ID, START),
      403,
      'email_not_verified',
    )
  })
})

describe('createGoogleOAuth', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'

  it('matches the RFC 7636 appendix B PKCE challenge', async () => {
    expect(await pkceChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('builds the consent URL with exactly the expected parameters', async () => {
    const url = await createGoogleOAuth(env).authorizationUrl('state-1', verifier)
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: TEST_CLIENT_ID,
      redirect_uri: 'http://localhost:5183/api/auth/google/callback',
      scope: 'openid email profile',
      state: 'state-1',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
      access_type: 'online',
      prompt: 'select_account',
    })
  })

  it('posts the code exchange to the token endpoint and returns the ID token', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ id_token: 'the-id-token', access_token: 'a' }), {
          status: 200,
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(createGoogleOAuth(env).exchangeCode('code-1', verifier)).resolves.toBe(
      'the-id-token',
    )
    const call = fetchMock.mock.calls[0]
    expect(String(call?.[0])).toBe('https://oauth2.googleapis.com/token')
    expect(call?.[1]?.method).toBe('POST')
    const sent = new URLSearchParams(String(call?.[1]?.body))
    expect(Object.fromEntries(sent)).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: 'http://localhost:5183/api/auth/google/callback',
      client_id: TEST_CLIENT_ID,
      client_secret: 'secret',
      code_verifier: verifier,
    })
  })

  it('fails when the token endpoint returns an error status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 400 })),
    )
    await expect(createGoogleOAuth(env).exchangeCode('code-1', verifier)).rejects.toThrow('400')
  })

  it('fails when the token response carries no ID token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ access_token: 'a' }), { status: 200 })),
    )
    await expect(createGoogleOAuth(env).exchangeCode('code-1', verifier)).rejects.toThrow(
      'no id_token',
    )
  })

  it('fails when the token response is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>', { status: 200 })),
    )
    await expect(createGoogleOAuth(env).exchangeCode('code-1', verifier)).rejects.toThrow()
  })
})
