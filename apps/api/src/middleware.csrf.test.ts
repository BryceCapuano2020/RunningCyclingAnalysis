import { describe, expect, it } from 'vitest'
import { createHarness } from './test/harness.ts'

describe('csrfGuard', () => {
  it.each([
    ['POST', '/api/auth/logout', undefined],
    ['PUT', '/api/profile', { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: false }],
    ['DELETE', '/api/activities/missing', undefined],
  ] as const)('accepts %s %s with the exact client header value', async (method, path, json) => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await h.send({
      method,
      path,
      json,
      headers: { 'X-RCA-Client': 'web' },
      csrf: false,
      cookies: { rca_session: token },
    })
    expect(res.status).not.toBe(403)
  })

  it.each([
    ['a different value', 'evil'],
    ['an empty value', ''],
    ['the value in upper case', 'WEB'],
    ['the value in another case', 'Web'],
    ['a value with a suffix', 'web-evil'],
  ])('rejects POST, PUT and DELETE that send %s', async (_label, value) => {
    const h = createHarness()
    const token = await h.signIn()
    const requests = [
      { method: 'POST', path: '/api/auth/logout' },
      {
        method: 'PUT',
        path: '/api/profile',
        json: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: false },
      },
      { method: 'DELETE', path: '/api/activities/missing' },
    ]
    for (const request of requests) {
      const res = await h.send({
        ...request,
        headers: { 'X-RCA-Client': value },
        csrf: false,
        cookies: { rca_session: token },
      })
      expect(res.status, `${request.method} ${request.path}`).toBe(403)
      expect(await res.json()).toMatchObject({ error: { code: 'csrf_rejected' } })
    }
  })

  it('rejects a mutating request that omits the header', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await h.send({
      method: 'POST',
      path: '/api/auth/logout',
      csrf: false,
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: { code: 'csrf_rejected' } })
  })

  it('leaves GET and HEAD requests alone without the header', async () => {
    const h = createHarness()
    expect((await h.send({ path: '/api/health', csrf: false })).status).not.toBe(403)
    expect((await h.send({ method: 'HEAD', path: '/api/health', csrf: false })).status).not.toBe(
      403,
    )
  })
})
