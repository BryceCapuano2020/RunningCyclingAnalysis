import { describe, expect, it } from 'vitest'
import { createHarness, sessionCookie, sha256Token } from '../test/harness.ts'
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
})
