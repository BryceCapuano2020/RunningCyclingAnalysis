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

describe('same-origin check on budget-spending GETs', () => {
  async function spentReads(h: ReturnType<typeof createHarness>): Promise<number> {
    const row = await h.env.DB.prepare(
      "SELECT coalesce(sum(used), 0) AS n FROM daily_budget WHERE action IN ('read', 'fileDownload')",
    ).first<{ n: number }>()
    return row?.n ?? 0
  }

  it.each([['cross-site'], ['same-site'], ['an unrecognised value']])(
    'refuses a library listing with %s in Sec-Fetch-Site, before it takes a read unit',
    async (site) => {
      const h = createHarness()
      const token = await h.signIn()
      const res = await h.send({
        path: '/api/activities',
        headers: { 'Sec-Fetch-Site': site },
        cookies: { rca_session: token },
      })
      expect(res.status).toBe(403)
      expect(await res.json()).toMatchObject({ error: { code: 'csrf_rejected' } })
      expect(await spentReads(h)).toBe(0)
    },
  )

  it('refuses a cross-site file download before it looks up the activity or takes a unit', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await h.send({
      path: '/api/activities/missing/file',
      headers: { 'Sec-Fetch-Site': 'cross-site' },
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: { code: 'csrf_rejected' } })
    expect(await spentReads(h)).toBe(0)
  })

  it.each([['same-origin'], ['none'], [undefined]])(
    'serves a library listing when Sec-Fetch-Site is %s',
    async (site) => {
      const h = createHarness()
      const token = await h.signIn()
      const headers: Record<string, string> = site === undefined ? {} : { 'Sec-Fetch-Site': site }
      const res = await h.send({
        path: '/api/activities',
        headers,
        cookies: { rca_session: token },
      })
      expect(res.status).toBe(200)
      expect(await spentReads(h)).toBe(1)
    },
  )
})
