import { describe, expect, it, vi } from 'vitest'
import app from './index.ts'
import { systemDeps } from './deps.ts'
import { createHarness, digestFixture } from './test/harness.ts'

describe('app shell', () => {
  it('serves the health check without a session or CSRF header', async () => {
    const h = createHarness()
    const res = await h.send({ path: '/api/health' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('exports a Worker entry point with a fetch handler', () => {
    expect(typeof app.fetch).toBe('function')
  })

  it('uses the real clock and CSPRNG by default', () => {
    expect(Math.abs(systemDeps.now() - Date.now())).toBeLessThan(5_000)
    expect(systemDeps.randomBytes(32)).toHaveLength(32)
    expect(systemDeps.randomUUID()).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('answers a missing hashed asset with a plain 404, not JSON or the app shell', async () => {
    const h = createHarness()
    const res = await h.send({ path: '/assets/missing-0123abcd.js' })
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/)
    expect(await res.text()).toBe('Not found')
  })

  it('answers unknown paths with an ApiError', async () => {
    const h = createHarness()
    const res = await h.send({ path: '/nope' })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } })
  })

  it('rejects state-changing requests without the client header with 403', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const cases: { method: string; path: string; json?: unknown }[] = [
      { method: 'POST', path: '/api/auth/logout' },
      { method: 'POST', path: '/api/auth/dev-login', json: { email: 'a@b.co', name: 'A' } },
      { method: 'PUT', path: '/api/profile', json: {} },
      { method: 'DELETE', path: '/api/me' },
      { method: 'POST', path: '/api/activities', json: {} },
      { method: 'PUT', path: '/api/activities/x/file' },
      { method: 'DELETE', path: '/api/activities/x' },
    ]
    for (const c of cases) {
      const res = await h.send({ ...c, cookies: { rca_session: token }, csrf: false })
      expect(res.status, `${c.method} ${c.path}`).toBe(403)
      expect(await res.json()).toMatchObject({ error: { code: 'csrf_rejected' } })
    }
  })

  it('rejects a CSRF header with the wrong value', async () => {
    const h = createHarness()
    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: {},
      headers: { 'X-RCA-Client': 'mobile' },
      csrf: false,
    })
    expect(res.status).toBe(403)
  })

  it('does not require the header for GET requests', async () => {
    const h = createHarness()
    const res = await h.send({ path: '/api/me', csrf: false })
    expect(res.status).toBe(200)
    expect(await res.json()).toBeNull()
  })

  it('answers a HEAD for /api/me as the GET does', async () => {
    const h = createHarness()
    const res = await h.send({ method: 'HEAD', path: '/api/me', csrf: false })
    expect(res.status).toBe(200)
  })

  it('still requires the header for a mutation a signed-out visitor sends', async () => {
    const h = createHarness()
    const res = await h.send({ method: 'PUT', path: '/api/profile', json: {}, csrf: false })
    expect(res.status).toBe(403)
  })

  it('turns an unexpected failure into a 500 ApiError', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let broken = false
    const h = createHarness({
      randomUUID: () => {
        if (broken) throw new Error('disk on fire')
        return 'fixed-id'
      },
    })
    const token = await h.signIn()
    broken = true
    const res = await h.send({
      method: 'POST',
      path: '/api/activities',
      json: { digest: digestFixture(), fileName: 'ride.fit', fileHash: 'b'.repeat(64) },
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: { code: 'internal_error', message: 'Something went wrong' },
    })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
