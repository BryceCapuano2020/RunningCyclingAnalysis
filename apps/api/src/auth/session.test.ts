import { describe, expect, it } from 'vitest'
import { ACCOUNT_SCOPE_HEADER } from '@rca/contract'
import {
  countingDb,
  createHarness,
  sessionCookie,
  sha256Token,
  START,
  testEnv,
} from '../test/harness.ts'
import { SESSION_REFRESH_WITHIN_MS, SESSION_TTL_MS } from './session.ts'

const DAY = 24 * 60 * 60 * 1000

describe('sessions', () => {
  it('stores only the SHA-256 of the token and expires 30 days out', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await sha256Token(token)
    const rows = await h.env.DB.prepare('SELECT id, expires_at FROM sessions').all<{
      id: string
      expires_at: number
    }>()
    expect(rows.results).toEqual([{ id, expires_at: h.clock.now + SESSION_TTL_MS }])
    expect(rows.results.some((r) => r.id === token)).toBe(false)
  })

  it('accepts a session that is still inside its lifetime, without refreshing it', async () => {
    const h = createHarness()
    const token = await h.signIn()
    h.clock.now += 10 * DAY
    const res = await h.send({ path: '/api/me', cookies: { rca_session: token } })
    expect(res.status).toBe(200)
    expect(sessionCookie(res)).toBeUndefined()
  })

  it('refreshes a session with under 15 days left, pushing it to 30 days', async () => {
    const h = createHarness()
    const token = await h.signIn()
    h.clock.now += 20 * DAY
    const res = await h.send({ path: '/api/me', cookies: { rca_session: token } })
    expect(res.status).toBe(200)
    expect(sessionCookie(res)).toBe(token)
    const row = await h.env.DB.prepare('SELECT expires_at FROM sessions WHERE id = ?')
      .bind(await sha256Token(token))
      .first<{ expires_at: number }>()
    expect(row?.expires_at).toBe(h.clock.now + SESSION_TTL_MS)
  })

  it('refreshes again on a later use that falls inside the window', async () => {
    const h = createHarness()
    const token = await h.signIn()
    h.clock.now += 20 * DAY
    await h.send({ path: '/api/me', cookies: { rca_session: token } })
    h.clock.now += 20 * DAY
    const res = await h.send({ path: '/api/me', cookies: { rca_session: token } })
    expect(res.status).toBe(200)
    expect(sessionCookie(res)).toBe(token)
  })

  it('refreshes only once less than 15 days remain', async () => {
    const h = createHarness()
    const token = await h.signIn()
    h.clock.now += SESSION_TTL_MS - SESSION_REFRESH_WITHIN_MS
    expect(sessionCookie(await h.send({ path: '/api/me', cookies: { rca_session: token } }))).toBe(
      undefined,
    )
    h.clock.now += 1
    expect(sessionCookie(await h.send({ path: '/api/me', cookies: { rca_session: token } }))).toBe(
      token,
    )
  })

  it('rejects and deletes a session at its exact expiry instant', async () => {
    const h = createHarness()
    const token = await h.signIn()
    h.clock.now += SESSION_TTL_MS
    const res = await h.send({ path: '/api/me', cookies: { rca_session: token } })
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie')).toMatch(/^rca_session=;/)
    const remaining = await h.env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first<{
      n: number
    }>()
    expect(remaining?.n).toBe(0)
  })

  it('rejects an unknown token and clears the cookie', async () => {
    const h = createHarness()
    const res = await h.send({ path: '/api/me', cookies: { rca_session: 'not-a-real-token' } })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({
      error: { code: 'unauthenticated', message: 'Sign in required' },
    })
    expect(res.headers.get('set-cookie')).toMatch(/^rca_session=;/)
  })

  it('treats a request with no cookie as signed out', async () => {
    const h = createHarness()
    expect((await h.send({ path: '/api/me' })).status).toBe(401)
  })

  it('logs out by deleting the session row and clearing the cookie', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await h.send({
      method: 'POST',
      path: '/api/auth/logout',
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('set-cookie')).toMatch(/^rca_session=;/)
    expect((await h.send({ path: '/api/me', cookies: { rca_session: token } })).status).toBe(401)
  })

  it('does not let a stale account-scoped logout clear a different session', async () => {
    const h = createHarness()
    const alice = await h.signIn('alice@example.com')
    const aliceMe = (await (
      await h.send({ path: '/api/me', cookies: { rca_session: alice } })
    ).json()) as {
      user: { id: string }
    }
    const bob = await h.signIn('bob@example.com')
    const mismatch = await h.send({
      method: 'POST',
      path: '/api/auth/logout',
      cookies: { rca_session: bob },
      headers: { [ACCOUNT_SCOPE_HEADER]: aliceMe.user.id },
    })
    expect(mismatch.status).toBe(409)
    expect(await mismatch.json()).toMatchObject({ error: { code: 'account_changed' } })
    expect((await h.send({ path: '/api/me', cookies: { rca_session: bob } })).status).toBe(200)

    expect(
      (await h.send({ method: 'POST', path: '/api/auth/logout', cookies: { rca_session: bob } }))
        .status,
    ).toBe(204)
  })

  it('logout without a session still succeeds', async () => {
    const h = createHarness()
    const res = await h.send({ method: 'POST', path: '/api/auth/logout' })
    expect(res.status).toBe(204)
  })

  it('logout with an unknown cookie succeeds and deletes nothing', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await h.send({
      method: 'POST',
      path: '/api/auth/logout',
      cookies: { rca_session: 'unknown' },
    })
    expect(res.status).toBe(204)
    expect((await h.send({ path: '/api/me', cookies: { rca_session: token } })).status).toBe(200)
  })

  it.each([
    ['uppercase hex', 'A'.repeat(64)],
    ['too short', 'a'.repeat(63)],
    ['too long', 'a'.repeat(65)],
    ['non-hex characters', 'z'.repeat(64)],
    ['path traversal', '../../etc/passwd'],
    ['empty', ''],
  ])('reads a %s cookie without touching D1', async (_label, value) => {
    const counted = countingDb(testEnv().DB)
    const h = createHarness({}, { DB: counted.db })
    const me = await h.send({ path: '/api/me', cookies: { rca_session: value } })
    expect(me.status).toBe(401)
    const logout = await h.send({
      method: 'POST',
      path: '/api/auth/logout',
      cookies: { rca_session: value },
    })
    expect(logout.status).toBe(204)
    expect(counted.count()).toBe(0)
  })

  it('still looks up a well-formed token, which proves the counter sees D1 calls', async () => {
    const counted = countingDb(testEnv().DB)
    const h = createHarness({}, { DB: counted.db })
    const token = await h.signIn()
    counted.reset()
    await h.send({ path: '/api/me', cookies: { rca_session: token } })
    expect(counted.count()).toBeGreaterThan(0)
  })

  it('ends a session 90 days after creation, however regularly it is used', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const useAt = async (day: number) => {
      h.clock.now = START + day * DAY
      return (await h.send({ path: '/api/me', cookies: { rca_session: token } })).status
    }
    // Each use falls inside the 15-day refresh window, so the 30-day window keeps moving forward.
    expect(await useAt(20)).toBe(200)
    expect(await useAt(40)).toBe(200)
    expect(await useAt(60)).toBe(200)
    expect(await useAt(85)).toBe(200)
    expect(await useAt(90)).toBe(401)
    expect(
      await h.env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first<{ n: number }>(),
    ).toEqual({ n: 0 })
  })

  it('stops extending a session once the absolute end is reached', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const useAt = (day: number) => {
      h.clock.now = START + day * DAY
      return h.send({ path: '/api/me', cookies: { rca_session: token } })
    }
    await useAt(20)
    await useAt(40)
    const at60 = await useAt(60)
    expect(sessionCookie(at60)).toBe(token)
    const at80 = await useAt(80)
    expect(at80.status).toBe(200)
    expect(sessionCookie(at80)).toBeUndefined()
    const row = await h.env.DB.prepare('SELECT expires_at, created_at FROM sessions').first<{
      expires_at: number
      created_at: number
    }>()
    expect(row?.created_at).toBe(START)
    expect(row?.expires_at).toBe(START + 90 * DAY)
  })
})

describe('signed session cookies', () => {
  it('rejects a well-formed token with no signature, and one with a forged signature, without touching D1', async () => {
    const plain = createHarness()
    const valid = await plain.signIn()
    const [token = ''] = valid.split('.')
    const tampered = `${token}.${'0'.repeat(64)}`
    const counted = countingDb(testEnv().DB)
    const h = createHarness({}, { DB: counted.db })
    for (const cookie of [token, tampered]) {
      const res = await h.send({ path: '/api/me', cookies: { rca_session: cookie } })
      expect(res.status).toBe(401)
    }
    expect(counted.count()).toBe(0)
  })

  it('rejects a real token whose signature was altered in its last character', async () => {
    const h = createHarness()
    const valid = await h.signIn()
    const flipped = valid.slice(0, -1) + (valid.endsWith('0') ? '1' : '0')
    expect((await h.send({ path: '/api/me', cookies: { rca_session: flipped } })).status).toBe(401)
    expect((await h.send({ path: '/api/me', cookies: { rca_session: valid } })).status).toBe(200)
  })

  it('does not accept a session signed with a different key', async () => {
    const other = createHarness({}, { SESSION_SIGNING_KEY: 'a-different-deployment-key-32-bytes!' })
    const foreign = await other.signIn()
    const h = createHarness()
    expect((await h.send({ path: '/api/me', cookies: { rca_session: foreign } })).status).toBe(401)
  })

  it('refuses to create a session when no signing key is configured, and writes no session row', async () => {
    const h = createHarness({}, { SESSION_SIGNING_KEY: undefined })
    const res = await h.send({
      method: 'POST',
      path: '/api/auth/dev-login',
      json: { email: 'rider@example.com', name: 'Rider' },
    })
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({
      error: { code: 'service_unavailable', message: 'Service is temporarily unavailable' },
    })
    expect(sessionCookie(res)).toBeUndefined()
    expect(
      await h.env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first<{ n: number }>(),
    ).toEqual({ n: 0 })
  })

  it('refuses to create a session with a signing key shorter than 32 bytes, and writes no session row', async () => {
    const h = createHarness({}, { SESSION_SIGNING_KEY: 'k'.repeat(31) })
    const res = await h.send({
      method: 'POST',
      path: '/api/auth/dev-login',
      json: { email: 'rider@example.com', name: 'Rider' },
    })
    expect(res.status).toBe(503)
    expect(sessionCookie(res)).toBeUndefined()
    expect(
      await h.env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first<{ n: number }>(),
    ).toEqual({ n: 0 })
  })

  it('accepts a signing key of exactly 32 bytes', async () => {
    const h = createHarness({}, { SESSION_SIGNING_KEY: 'k'.repeat(32) })
    const token = await h.signIn()
    expect((await h.send({ path: '/api/me', cookies: { rca_session: token } })).status).toBe(200)
  })

  it('fails closed on a session cookie when the signing key is shorter than 32 bytes', async () => {
    const signed = await createHarness().signIn()
    const h = createHarness({}, { SESSION_SIGNING_KEY: 'k'.repeat(31) })
    const res = await h.send({ path: '/api/me', cookies: { rca_session: signed } })
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({
      error: { code: 'service_unavailable', message: 'Service is temporarily unavailable' },
    })
  })

  it('fails closed on a session cookie when no signing key is configured', async () => {
    const signed = await createHarness().signIn()
    const h = createHarness({}, { SESSION_SIGNING_KEY: undefined })
    expect((await h.send({ path: '/api/me', cookies: { rca_session: signed } })).status).toBe(503)
  })
})
