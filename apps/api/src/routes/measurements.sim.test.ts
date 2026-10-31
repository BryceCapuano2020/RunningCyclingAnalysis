import { DAILY_LIMITS } from '@rca/contract'
import { describe, expect, it } from 'vitest'
import { createHarness } from '../test/harness.ts'

// The full sweeps behind the measurement daily limits, from an empty day. measurements.test.ts decides
// the same boundary from a day one unit short; these send every request of the limit.

const MASS = { kind: 'massKg', value: 82.5, from: '2024-03-01' }

async function signedIn() {
  const h = createHarness()
  const token = await h.signIn()
  const cookies = { rca_session: token }
  const put = (json: unknown) => h.send({ method: 'PUT', path: '/api/measurements', json, cookies })
  return { h, cookies, put }
}

describe('measurement daily limits, swept from an empty day', () => {
  it('spends one measurementRead unit a read, then answers 429 daily_limit', async () => {
    const { h, cookies } = await signedIn()
    for (let i = 0; i < DAILY_LIMITS.measurementRead; i++) {
      expect((await h.send({ path: '/api/measurements', cookies })).status).toBe(200)
    }
    const res = await h.send({ path: '/api/measurements', cookies })
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: { code: 'daily_limit' } })
  })

  it('spends a measurementWrite unit a write, then answers 429 daily_limit', async () => {
    const { put } = await signedIn()
    for (let i = 0; i < DAILY_LIMITS.measurementWrite; i++) {
      expect((await put({ ...MASS, value: 70 + (i % 10) })).status).toBe(200)
    }
    const res = await put(MASS)
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: { code: 'daily_limit' } })
  })
})
