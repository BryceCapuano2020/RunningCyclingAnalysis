import { describe, expect, it, vi } from 'vitest'
import { createHarness, testEnv } from '../test/harness.ts'

function failingDb(): D1Database {
  return new Proxy(testEnv().DB, {
    get(target, property) {
      if (property === 'prepare')
        return () => {
          throw new Error('D1 unavailable')
        }
      const value = Reflect.get(target, property, target) as unknown
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

function failingBucket(method: 'head' | 'get'): R2Bucket {
  return new Proxy(testEnv().FILES!, {
    get(target, property) {
      if (property === method)
        return async () => {
          throw new Error('R2 unavailable')
        }
      const value = Reflect.get(target, property, target) as unknown
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

describe('GET /api/health', () => {
  it('stays a cheap static check that touches no storage', async () => {
    const h = createHarness({}, { DB: failingDb(), FILES: failingBucket('head') })
    const res = await h.send({ path: '/api/health' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })
})

describe('GET /api/health/deep', () => {
  it('returns 200 with timings for D1 and R2, and is never cached', async () => {
    const h = createHarness()
    const res = await h.send({ path: '/api/health/deep' })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = (await res.json()) as {
      status: string
      checks: Record<string, { ok: boolean; ms: number }>
    }
    expect(body.status).toBe('ok')
    for (const name of ['d1', 'r2']) {
      expect(body.checks[name]).toMatchObject({ ok: true })
      expect(body.checks[name]?.ms).toBeGreaterThanOrEqual(0)
    }
  })

  it('returns 503 when D1 cannot answer SELECT 1', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const h = createHarness({}, { DB: failingDb() })
    const res = await h.send({ path: '/api/health/deep' })
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ status: 'unavailable', checks: { d1: { ok: false } } })
    spy.mockRestore()
  })

  it('returns 503 when the R2 sentinel check fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const h = createHarness({}, { FILES: failingBucket('head') })
    const res = await h.send({ path: '/api/health/deep' })
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ checks: { d1: { ok: true }, r2: { ok: false } } })
    spy.mockRestore()
  })

  it('returns 503 when no bucket is bound, so a D1-only deployment is not reported healthy', async () => {
    const h = createHarness({}, { FILES: undefined })
    expect((await h.send({ path: '/api/health/deep' })).status).toBe(503)
  })

  it('returns 503 while the standard R2 operation budget is spent', async () => {
    const h = createHarness()
    await h.env.DB.prepare(
      "INSERT INTO r2_storage_budget (id, lifetime_put_bytes, monthly_period, monthly_operations) VALUES (1, 0, '2026-01', 90000) ON CONFLICT(id) DO UPDATE SET monthly_period = '2026-01', monthly_operations = 90000",
    ).run()
    const res = await h.send({ path: '/api/health/deep' })
    expect(res.status).toBe(503)
  })

  it('is rate limited on its own, with a retry delay', async () => {
    const deny = vi.fn(async () => ({ success: false }))
    const h = createHarness({}, { ENVIRONMENT: 'production', HEALTH_RATE_LIMITER: { limit: deny } })
    const res = await h.send({
      path: '/api/health/deep',
      headers: { 'CF-Connecting-IP': '192.0.2.44' },
    })
    expect(res.status).toBe(429)
    expect(deny).toHaveBeenCalledWith({ key: 'health:192.0.2.44' })
    expect(await res.json()).toMatchObject({ error: { code: 'rate_limited' } })
  })
})
