import { describe, expect, it, vi } from 'vitest'
import {
  MAX_HEALTH_PROBES_PER_DAY,
  MAX_HEALTH_PROBES_PER_MONTH,
  reserveHealthProbe,
} from '../healthBudget.ts'
import { createHarness, START, testEnv } from '../test/harness.ts'

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
    expect(await res.json()).toEqual({ status: 'ok', sha: 'unknown' })
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

  it('does not charge deep-health HEADs to the ordinary R2 operation budget', async () => {
    const h = createHarness()
    await h.env.DB.prepare(
      "INSERT INTO r2_storage_budget (id, lifetime_put_bytes, monthly_period, monthly_operations) VALUES (1, 0, '2026-01', 90000) ON CONFLICT(id) DO UPDATE SET monthly_period = '2026-01', monthly_operations = 90000",
    ).run()
    const res = await h.send({ path: '/api/health/deep' })
    expect(res.status).toBe(200)
    expect(
      await h.env.DB.prepare(
        'SELECT monthly_operations FROM r2_storage_budget WHERE id = 1',
      ).first(),
    ).toEqual({ monthly_operations: 90000 })
  })

  it('atomically enforces the global daily and monthly probe ceilings before calling R2', async () => {
    const head = vi.fn(async () => null)
    const bucket = new Proxy(testEnv().FILES!, {
      get(target, property) {
        if (property === 'head') return head
        const value = Reflect.get(target, property, target) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const h = createHarness({}, { FILES: bucket })
    const day = new Date(START).toISOString().slice(0, 10)
    const month = day.slice(0, 7)
    await h.env.DB.prepare(
      `INSERT INTO r2_storage_budget (
         id, lifetime_put_bytes, monthly_period, monthly_operations, monthly_put_bytes,
         health_probe_day, health_probe_day_count, health_probe_month, health_probe_month_count
       ) VALUES (1, 0, ?, 0, 0, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         health_probe_day = excluded.health_probe_day,
         health_probe_day_count = excluded.health_probe_day_count,
         health_probe_month = excluded.health_probe_month,
         health_probe_month_count = excluded.health_probe_month_count`,
    )
      .bind(month, day, MAX_HEALTH_PROBES_PER_DAY - 1, month, MAX_HEALTH_PROBES_PER_MONTH - 1)
      .run()

    const reservations = await Promise.allSettled(
      Array.from({ length: 12 }, () => reserveHealthProbe(h.env.DB, START)),
    )
    expect(reservations.filter((result) => result.status === 'fulfilled')).toHaveLength(1)

    const res = await h.send({ path: '/api/health/deep' })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({
      status: 'ok',
      deep: 'skipped',
      reason: 'deep health budget reached',
    })
    expect(head).not.toHaveBeenCalled()
  })

  it('reports a skipped deep check with 200 once the monthly ceiling is reached, so uptime does not read it as an outage', async () => {
    const head = vi.fn(async () => null)
    const bucket = new Proxy(testEnv().FILES!, {
      get(target, property) {
        if (property === 'head') return head
        const value = Reflect.get(target, property, target) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const h = createHarness({}, { FILES: bucket })
    const month = new Date(START).toISOString().slice(0, 7)
    await h.env.DB.prepare(
      `INSERT INTO r2_storage_budget (
         id, lifetime_put_bytes, monthly_period, monthly_operations, monthly_put_bytes,
         health_probe_day, health_probe_day_count, health_probe_month, health_probe_month_count
       ) VALUES (1, 0, ?, 0, 0, '2000-01-01', 0, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         health_probe_day = excluded.health_probe_day,
         health_probe_day_count = excluded.health_probe_day_count,
         health_probe_month = excluded.health_probe_month,
         health_probe_month_count = excluded.health_probe_month_count`,
    )
      .bind(month, month, MAX_HEALTH_PROBES_PER_MONTH)
      .run()

    const res = await h.send({ path: '/api/health/deep' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok', deep: 'skipped' })
    expect(head).not.toHaveBeenCalled()
  })

  it('resets the probe allowance when the UTC month rolls over', async () => {
    const h = createHarness()
    const now = Date.UTC(2026, 1, 1, 0, 0, 1)
    await h.env.DB.prepare(
      `INSERT INTO r2_storage_budget (
         id, lifetime_put_bytes, monthly_period, monthly_operations, monthly_put_bytes,
         health_probe_day, health_probe_day_count, health_probe_month, health_probe_month_count
       ) VALUES (1, 0, '2026-01', 0, 0, '2026-01-31', ?, '2026-01', ?)
       ON CONFLICT(id) DO UPDATE SET
         health_probe_day = excluded.health_probe_day,
         health_probe_day_count = excluded.health_probe_day_count,
         health_probe_month = excluded.health_probe_month,
         health_probe_month_count = excluded.health_probe_month_count`,
    )
      .bind(MAX_HEALTH_PROBES_PER_DAY, MAX_HEALTH_PROBES_PER_MONTH)
      .run()

    await reserveHealthProbe(h.env.DB, now)
    expect(
      await h.env.DB.prepare(
        'SELECT health_probe_day, health_probe_day_count, health_probe_month, health_probe_month_count FROM r2_storage_budget WHERE id = 1',
      ).first(),
    ).toEqual({
      health_probe_day: '2026-02-01',
      health_probe_day_count: 1,
      health_probe_month: '2026-02',
      health_probe_month_count: 1,
    })
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
