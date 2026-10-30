import { describe, expect, it, vi } from 'vitest'
import { createHarness } from './test/harness.ts'

/*
 * Guards on the limiters that the default-path tests in rateLimit.test.ts do not reach: every write
 * method is limited, not only PUT, and anything but an explicit development environment keeps the limits on.
 */
describe('the per-account write limiter', () => {
  it.each([
    ['POST', '/api/activities'],
    ['PUT', '/api/profile'],
    ['DELETE', '/api/me'],
  ] as const)(
    'refuses %s %s when the limiter says no, before the route runs',
    async (method, path) => {
      const write = vi.fn(async () => ({ success: false }))
      const h = createHarness({}, { WRITE_RATE_LIMITER: { limit: write } })
      const token = await h.signIn()
      h.env.ENVIRONMENT = 'production'
      const res = await h.send({ method, path, cookies: { '__Host-rca_session': token }, json: {} })
      expect(res.status).toBe(429)
      expect(write).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['GET', 'HEAD', 'OPTIONS'])('does not charge a %s', async (method) => {
    const write = vi.fn(async () => ({ success: false }))
    const h = createHarness({}, { WRITE_RATE_LIMITER: { limit: write } })
    const token = await h.signIn()
    h.env.ENVIRONMENT = 'production'
    await h.send({ method, path: '/api/me', cookies: { '__Host-rca_session': token } })
    expect(write).not.toHaveBeenCalled()
  })
})

describe('an environment that is not development', () => {
  // A deploy that forgets or mistypes ENVIRONMENT must keep the limits on, not switch them off.
  it.each([
    ['public', '/api/health', 'API_RATE_LIMITER'],
    ['auth', '/api/auth/google', 'AUTH_RATE_LIMITER'],
    ['deep health', '/api/health/deep', 'HEALTH_RATE_LIMITER'],
  ] as const)('keeps the %s limit on in staging', async (_name, path, binding) => {
    const deny = vi.fn(async () => ({ success: false }))
    // The public limiter runs first on every route, so the other two are tested with it admitting.
    const admit = { limit: async () => ({ success: true }) }
    const h = createHarness(
      {},
      { ENVIRONMENT: 'staging', API_RATE_LIMITER: admit, [binding]: { limit: deny } },
    )
    expect((await h.send({ path })).status).toBe(429)
    expect(deny).toHaveBeenCalled()
  })

  it('keeps the account write limit on in staging', async () => {
    const write = vi.fn(async () => ({ success: false }))
    const h = createHarness({}, { WRITE_RATE_LIMITER: { limit: write } })
    const token = await h.signIn()
    h.env.ENVIRONMENT = 'staging'
    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      cookies: { '__Host-rca_session': token },
      json: {},
    })
    expect(res.status).toBe(429)
    expect(write).toHaveBeenCalledTimes(1)
  })
})
