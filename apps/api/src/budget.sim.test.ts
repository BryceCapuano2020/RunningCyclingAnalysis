import { DAILY_LIMITS } from '@rca/contract'
import { describe, expect, it } from 'vitest'
import { createHarness } from './test/harness.ts'

// The full sweeps behind the daily profile-write limit, from an empty day. budget.test.ts decides
// the same boundary from a day one unit short; these send every request of the limit.
describe('daily profile-write limit, swept from an empty day', () => {
  it('admits exactly the 50th profile write and refuses the 51st', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const statuses: number[] = []
    for (let i = 0; i < DAILY_LIMITS.profileWrite + 1; i += 1) {
      const res = await h.send({
        method: 'PUT',
        path: '/api/profile',
        json: { massKg: 75 + (i % 2), bikeMassKg: 9, units: 'imperial', keepFiles: false },
        cookies: { rca_session: token },
      })
      statuses.push(res.status)
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(50)
    expect(statuses.at(-1)).toBe(429)
  })

  it('never admits more than the limit under concurrent writes', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const responses = await Promise.all(
      Array.from({ length: DAILY_LIMITS.profileWrite + 10 }, (_, i) =>
        h.send({
          method: 'PUT',
          path: '/api/profile',
          json: { massKg: 75 + (i % 2), bikeMassKg: 9, units: 'imperial', keepFiles: false },
          cookies: { rca_session: token },
        }),
      ),
    )
    expect(responses.filter((r) => r.status === 200)).toHaveLength(DAILY_LIMITS.profileWrite)
    expect(responses.filter((r) => r.status === 429)).toHaveLength(10)
  })
})
