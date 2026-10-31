import { describe, expect, it } from 'vitest'
import { createHarness, digestFixture } from './test/harness.ts'
import { isReadOnly } from './readOnly.ts'

describe('the operator switch', () => {
  it.each(['true', 'TRUE', ' 1 ', 'on', 'On'])('reads %j as on', (value) => {
    expect(isReadOnly({ READ_ONLY: value })).toBe(true)
  })

  it.each([undefined, '', 'false', '0', 'off', 'yes', 'no'])('reads %j as off', (value) => {
    expect(isReadOnly({ READ_ONLY: value })).toBe(false)
  })
})

const as = (token: string) => ({ cookies: { rca_session: token } })
const create = (token: string) => ({
  method: 'POST' as const,
  path: '/api/activities',
  json: { digest: digestFixture(), fileName: 'ride.fit', fileHash: 'a'.repeat(64) },
  ...as(token),
})

describe('read-only mode', () => {
  it('lets everything through while the switch is off', async () => {
    const h = createHarness()
    const token = await h.signIn()
    expect((await h.send(create(token))).status).toBe(201)
  })

  it('refuses writes with 503 read_only and a message, and stores nothing', async () => {
    const h = createHarness()
    const token = await h.signIn()
    h.env.READ_ONLY = 'true'

    for (const request of [
      create(token),
      { method: 'PUT' as const, path: '/api/profile', json: { massKg: 70 }, ...as(token) },
      { method: 'DELETE' as const, path: '/api/me', ...as(token) },
      { method: 'PATCH' as const, path: '/api/activities/labels', json: {}, ...as(token) },
    ]) {
      const res = await h.send(request)
      expect(res.status, `${request.method} ${request.path}`).toBe(503)
      expect(await res.json()).toMatchObject({
        error: { code: 'read_only', message: expect.stringContaining('read-only') },
      })
    }
    const rows = await h.env.DB.prepare('SELECT COUNT(*) AS n FROM activities').first<{
      n: number
    }>()
    expect(rows?.n).toBe(0)
  })

  it('keeps answering reads for a signed-in account, and ending a session', async () => {
    const h = createHarness()
    const token = await h.signIn()
    expect((await h.send(create(token))).status).toBe(201)
    h.env.READ_ONLY = 'true'

    expect((await h.send({ path: '/api/me', ...as(token) })).status).toBe(200)
    const list = await h.send({ path: '/api/activities', ...as(token) })
    expect(list.status).toBe(200)
    expect(((await list.json()) as { items: unknown[] }).items).toHaveLength(1)
    expect((await h.send({ path: '/api/health' })).status).toBe(200)
    const out = await h.send({ method: 'POST', path: '/api/auth/logout', ...as(token) })
    expect(out.status).toBeLessThan(400)
  })

  it('refuses a new sign-in, and sends a browser back to the app with the code alone', async () => {
    const h = createHarness({}, { READ_ONLY: 'true' })

    const script = await h.send({ path: '/api/auth/google/callback?code=x&state=y' })
    expect(script.status).toBe(503)
    expect(await script.json()).toMatchObject({ error: { code: 'read_only' } })

    const browser = await h.send({
      path: '/api/auth/google/callback?code=x&state=y',
      headers: { 'Sec-Fetch-Mode': 'navigate' },
    })
    expect(browser.status).toBe(302)
    expect(browser.headers.get('location')).toBe('http://localhost:5183/#/?signin=read_only')
  })

  it('needs the same client header as any other write, and answers csrf first', async () => {
    const h = createHarness()
    const token = await h.signIn()
    h.env.READ_ONLY = 'true'
    const res = await h.send({ ...create(token), csrf: false })
    expect(res.status).toBe(403)
  })
})
