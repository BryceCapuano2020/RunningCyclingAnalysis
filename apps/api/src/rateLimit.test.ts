import { describe, expect, it, vi } from 'vitest'
import { createHarness } from './test/harness.ts'

describe('edge rate limits', () => {
  it('does not apply production rate limits to local development', async () => {
    const deny = vi.fn(async () => ({ success: false }))
    const h = createHarness({}, { API_RATE_LIMITER: { limit: deny } })
    expect((await h.send({ path: '/api/health' })).status).toBe(200)
    expect(deny).not.toHaveBeenCalled()
  })

  it('rejects over-limit requests before authentication with a retry delay and private headers', async () => {
    const deny = vi.fn(async () => ({ success: false }))
    const h = createHarness({}, { ENVIRONMENT: 'production', API_RATE_LIMITER: { limit: deny } })
    const response = await h.send({
      path: '/api/activities',
      headers: { 'CF-Connecting-IP': '192.0.2.10' },
    })
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000')
    expect(deny).toHaveBeenCalledWith({ key: 'ip:192.0.2.10' })
    expect(await response.json()).toMatchObject({ error: { code: 'rate_limited' } })
  })

  it('limits OAuth separately and ignores spoofed forwarding headers', async () => {
    const auth = vi.fn(async () => ({ success: false }))
    const h = createHarness({}, { ENVIRONMENT: 'production', AUTH_RATE_LIMITER: { limit: auth } })
    const response = await h.send({
      path: '/api/auth/google',
      headers: { 'X-Forwarded-For': '192.0.2.99' },
    })
    expect(response.status).toBe(429)
    expect(auth).toHaveBeenCalledWith({ key: 'auth:unknown' })
  })

  it('sends a browser that is rate limited on sign-in back to the app with the reason, not to raw JSON', async () => {
    const auth = vi.fn(async () => ({ success: false }))
    const h = createHarness({}, { ENVIRONMENT: 'production', AUTH_RATE_LIMITER: { limit: auth } })
    const navigations: Record<string, string>[] = [
      { 'Sec-Fetch-Mode': 'navigate' },
      { Accept: 'text/html,*/*;q=0.8' },
    ]
    for (const headers of navigations) {
      const response = await h.send({ path: '/api/auth/google', headers })
      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe('http://localhost:5183/#/?signin=rate_limited')
    }
  })

  it('sends the callback’s refusals back to the app too, with the code alone', async () => {
    const h = createHarness({})
    const response = await h.send({
      path: '/api/auth/google/callback?error=access_denied',
      headers: { 'Sec-Fetch-Mode': 'navigate' },
    })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('http://localhost:5183/#/?signin=oauth_denied')
  })

  it('keeps the JSON error for a script, and for every route that is not a sign-in page', async () => {
    const auth = vi.fn(async () => ({ success: false }))
    const h = createHarness({}, { ENVIRONMENT: 'production', AUTH_RATE_LIMITER: { limit: auth } })
    const script = await h.send({ path: '/api/auth/google' })
    expect(script.status).toBe(429)
    expect(await script.json()).toMatchObject({ error: { code: 'rate_limited' } })

    const other = await h.send({ path: '/api/me', headers: { 'Sec-Fetch-Mode': 'navigate' } })
    expect(other.status).not.toBe(302)
  })

  it('fails closed if a production binding is missing or unavailable', async () => {
    for (const limiter of [
      undefined,
      {
        limit: async () => {
          throw new Error('provider unavailable')
        },
      },
    ]) {
      const h = createHarness({}, { ENVIRONMENT: 'production', API_RATE_LIMITER: limiter })
      const response = await h.send({ path: '/api/health' })
      expect(response.status).toBe(503)
      expect(response.headers.get('retry-after')).toBe('60')
      expect(await response.json()).toMatchObject({ error: { code: 'service_unavailable' } })
    }
  })

  it('keys authenticated writes by user, and leaves reads and successful responses retry-header free', async () => {
    const write = vi.fn(async () => ({ success: false }))
    const h = createHarness({}, { WRITE_RATE_LIMITER: { limit: write } })
    const token = await h.signIn()
    h.env.ENVIRONMENT = 'production'
    const cookies = { '__Host-rca_session': token }
    const read = await h.send({ path: '/api/me', cookies })
    expect(read.status).toBe(200)
    expect(read.headers.get('retry-after')).toBeNull()
    expect(write).not.toHaveBeenCalled()
    const denied = await h.send({
      method: 'PUT',
      path: '/api/profile',
      cookies,
      json: { massKg: 75, bikeMassKg: 9, units: 'metric', keepFiles: true },
    })
    expect(denied.status).toBe(429)
    expect(write).toHaveBeenCalledWith({ key: expect.stringMatching(/^user:/) })
    expect(denied.headers.get('retry-after')).toBe('60')
  })
})
