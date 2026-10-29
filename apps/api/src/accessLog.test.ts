import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import { createHarness } from './test/harness.ts'
import { inSuccessSample, loggedMethod, routePattern } from './accessLog.ts'

interface Line {
  event: string
  method: string
  route: string
  status: number
  duration_ms: number
  request_id: string | null
}

let log: MockInstance<typeof console.log>

beforeEach(() => {
  log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
})
afterEach(() => {
  log.mockRestore()
  vi.restoreAllMocks()
})

/** A request id the 2xx sample keeps, and one it leaves out (the first eight hex digits mod 10). */
const SAMPLED_ID = '00000000-0000-4000-8000-000000000000'
const UNSAMPLED_ID = '00000001-0000-4000-8000-000000000000'
const withRequestId = (id: string) =>
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(id as ReturnType<typeof crypto.randomUUID>)

function lines(): Line[] {
  return log.mock.calls
    .map((args) => JSON.parse(String(args[0])) as Line)
    .filter((line) => line.event === 'api_request')
}

describe('access log', () => {
  it('writes one JSON line per request with method, route pattern, status, duration and request id', async () => {
    withRequestId(SAMPLED_ID)
    const h = createHarness()
    const res = await h.send({ path: '/api/health' })
    expect(lines()).toEqual([
      {
        event: 'api_request',
        method: 'GET',
        route: '/api/health',
        status: 200,
        duration_ms: 0,
        request_id: res.headers.get('X-Request-ID'),
      },
    ])
    expect(res.headers.get('X-Request-ID')).toBe(SAMPLED_ID)
  })

  it('leaves a quick 2xx response out unless its request id is in the sample', async () => {
    const h = createHarness()
    withRequestId(UNSAMPLED_ID)
    expect((await h.send({ path: '/api/health' })).status).toBe(200)
    expect(lines()).toEqual([])
    withRequestId(SAMPLED_ID)
    await h.send({ path: '/api/health' })
    expect(lines()).toHaveLength(1)
  })

  it('samples about one 2xx request in ten, by request id', () => {
    let kept = 0
    for (let i = 0; i < 10_000; i++) if (inSuccessSample(crypto.randomUUID())) kept++
    expect(kept).toBeGreaterThan(800)
    expect(kept).toBeLessThan(1_200)
    expect(inSuccessSample(null)).toBe(false)
  })

  it('always logs a slow request, however its request id samples', async () => {
    withRequestId(UNSAMPLED_ID)
    let now = 0
    const h = createHarness({ now: () => (now += 1_500) })
    await h.send({ path: '/api/health' })
    expect(lines()).toMatchObject([{ status: 200 }])
    expect(lines()[0]!.duration_ms).toBeGreaterThan(1_000)
  })

  it('logs a made-up verb as OTHER', async () => {
    const h = createHarness()
    await h.send({ method: 'PROPFIND', path: '/api/health' })
    expect(lines()[0]).toMatchObject({ method: 'OTHER' })
    expect(JSON.stringify(log.mock.calls)).not.toContain('PROPFIND')
    expect(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map(loggedMethod)).toEqual([
      'GET',
      'HEAD',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ])
  })

  it('logs the route pattern, not the raw path, query or ids in it', async () => {
    const h = createHarness()
    const token = await h.signIn()
    log.mockClear()
    const id = '1749798900000-private-activity-name.fit'
    const res = await h.send({
      path: `/api/activities/${id}/file?token=secret-query-value`,
      cookies: { rca_session: token },
    })
    const [line] = lines()
    expect(line).toMatchObject({ method: 'GET', route: '/api/activities/:id/file', status: 404 })
    expect(line!.request_id).toBe(res.headers.get('X-Request-ID'))
    const text = JSON.stringify(log.mock.calls)
    expect(text).not.toContain(id)
    expect(text).not.toContain('secret-query-value')
    expect(text).not.toContain(token)
  })

  it('logs an unknown path as unmatched, and never the path itself', async () => {
    const h = createHarness()
    const res = await h.send({ path: '/api/wp-admin/probe-7f3a' })
    expect(res.status).toBe(404)
    expect(lines()).toMatchObject([{ route: 'unmatched', status: 404 }])
    expect(JSON.stringify(log.mock.calls)).not.toContain('probe-7f3a')
  })

  it('logs a failed request with its status, and holds only the six fields, no user, address or body', async () => {
    const h = createHarness()
    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { email: 'rider@example.com' },
      headers: { 'CF-Connecting-IP': '203.0.113.9' },
    })
    expect(res.status).toBe(401)
    const [line] = lines()
    expect(Object.keys(line!).sort()).toEqual(
      ['duration_ms', 'event', 'method', 'request_id', 'route', 'status'].sort(),
    )
    expect(line).toMatchObject({ method: 'PUT', route: '/api/profile', status: 401 })
    const text = JSON.stringify(log.mock.calls)
    expect(text).not.toContain('rider@example.com')
    expect(text).not.toContain('203.0.113.9')
  })
})

describe('routePattern', () => {
  it('takes the last handler, skipping middleware, and falls back to unmatched', () => {
    expect(
      routePattern([
        { method: 'ALL', path: '/*' },
        { method: 'ALL', path: '/api/*' },
        { method: 'GET', path: '/api/activities/:id' },
      ]),
    ).toBe('/api/activities/:id')
    expect(routePattern([{ method: 'ALL', path: '/*' }])).toBe('unmatched')
  })
})
