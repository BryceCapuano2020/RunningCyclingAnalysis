import { describe, expect, it } from 'vitest'
import { createHarness, digestFixture } from './test/harness.ts'
import { sha256Hex } from './util.ts'

describe('response headers', () => {
  it('sets nosniff on a raw file download too', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const content = new TextEncoder().encode('<html>not really</html>')
    const created = await h.send({
      method: 'POST',
      path: '/api/activities',
      json: { digest: digestFixture(), fileName: 'a.html', fileHash: await sha256Hex(content) },
      cookies: { rca_session: token },
    })
    const { id } = (await created.json()) as { id: string }
    await h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: content,
      cookies: { rca_session: token },
    })
    const download = await h.send({
      path: `/api/activities/${id}/file`,
      cookies: { rca_session: token },
    })
    expect(download.status).toBe(200)
    expect(download.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('sets nosniff on every response, including errors', async () => {
    const h = createHarness()
    expect((await h.send({ path: '/api/health' })).headers.get('x-content-type-options')).toBe(
      'nosniff',
    )
    expect((await h.send({ path: '/nope' })).headers.get('x-content-type-options')).toBe('nosniff')
    expect((await h.send({ path: '/api/me' })).headers.get('x-content-type-options')).toBe(
      'nosniff',
    )
  })

  it('marks session and account responses no-store', async () => {
    const h = createHarness()
    expect((await h.send({ path: '/api/me' })).headers.get('cache-control')).toBe('no-store')
    const start = await h.send({ path: '/api/auth/google' })
    expect(start.headers.get('cache-control')).toBe('no-store')
    const logout = await h.send({ method: 'POST', path: '/api/auth/logout' })
    expect(logout.headers.get('cache-control')).toBe('no-store')
  })

  it('marks all API responses no-store, including activity/profile responses and errors', async () => {
    const h = createHarness()
    for (const path of ['/api/health', '/api/profile', '/api/activities', '/api/unknown']) {
      const response = await h.send({ path })
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('referrer-policy')).toBe('no-referrer')
      expect(response.headers.get('x-frame-options')).toBe('DENY')
      expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
      expect(response.headers.get('x-request-id')).toMatch(/^[a-f0-9-]{36}$/)
    }
  })
})

describe('body limits', () => {
  it('caps the profile body at 4 KB before it is parsed', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: {
        massKg: 75,
        bikeMassKg: 9,
        units: 'imperial',
        keepFiles: true,
        pad: 'x'.repeat(5000),
      },
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({ error: { code: 'payload_too_large' } })
  })

  it('caps the dev-login body at 4 KB', async () => {
    const h = createHarness()
    const res = await h.send({
      method: 'POST',
      path: '/api/auth/dev-login',
      json: { email: 'a@example.com', name: 'x'.repeat(5000) },
    })
    expect(res.status).toBe(413)
  })

  it('still lets a normal-sized profile through', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: true },
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(200)
  })
})

describe('malformed Content-Length', () => {
  it.each(['-1', 'abc', '1.5', '1e3'])(
    'rejects %j with 400 bad_request on a JSON route',
    async (length) => {
      const h = createHarness()
      const token = await h.signIn()
      const res = await h.send({
        method: 'PUT',
        path: '/api/profile',
        json: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: true },
        headers: { 'content-length': length },
        cookies: { rca_session: token },
      })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: { code: 'bad_request' } })
    },
  )

  it('rejects a malformed length on the upload route with 400, not 500', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const created = await h.send({
      method: 'POST',
      path: '/api/activities',
      json: {
        digest: digestFixture(),
        fileName: 'a.fit',
        fileHash: 'a'.repeat(64),
      },
      cookies: { rca_session: token },
    })
    const { id } = (await created.json()) as { id: string }
    const res = await h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: new Uint8Array([1, 2, 3]),
      headers: { 'content-length': 'abc' },
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'bad_request' } })
  })

  it('rejects a malformed length on activity create with 400', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await h.send({
      method: 'POST',
      path: '/api/activities',
      json: {},
      headers: { 'content-length': '-1' },
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'bad_request' } })
  })
})
