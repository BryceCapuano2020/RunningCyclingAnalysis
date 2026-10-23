import { describe, expect, it } from 'vitest'
import { createHarness, testEnv } from '../test/harness.ts'

const PROFILE = { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: false }

/** A profile request body of exactly `bytes` bytes: the JSON padded with trailing spaces. */
function profileBody(bytes: number): Uint8Array {
  const text = JSON.stringify({ ...PROFILE, keepFiles: true }).padEnd(bytes, ' ')
  return new TextEncoder().encode(text)
}

/** Counts every R2 call made through the bucket, so a test can prove none happened. */
function countingBucket(target: R2Bucket): { bucket: R2Bucket; calls: string[] } {
  const calls: string[] = []
  const bucket = new Proxy(target, {
    get(obj, prop) {
      const value: unknown = Reflect.get(obj, prop, obj)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        calls.push(String(prop))
        return Reflect.apply(value, obj, args)
      }
    },
  })
  return { bucket, calls }
}

describe('PUT /api/profile file sweep', () => {
  it('turns files off without touching R2 when the account has no stored files', async () => {
    const { bucket, calls } = countingBucket(testEnv().FILES)
    const h = createHarness({}, { FILES: bucket })
    const token = await h.signIn()
    await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { ...PROFILE, keepFiles: true },
      cookies: { rca_session: token },
    })
    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: PROFILE,
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(200)
    expect(calls).toEqual([])
    const budget = await testEnv()
      .DB.prepare('SELECT COUNT(*) AS n FROM r2_storage_budget')
      .first<{ n: number }>()
    expect(budget?.n).toBe(0)
  })
})

describe('PUT /api/profile body limit', () => {
  it('accepts a body of exactly 4 KiB', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      headers: { 'content-type': 'application/json' },
      raw: profileBody(4 * 1024),
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(200)
  })

  it('rejects a body one byte over 4 KiB with 413', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      headers: { 'content-type': 'application/json' },
      raw: profileBody(4 * 1024 + 1),
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({ error: { code: 'payload_too_large' } })
  })
})
