import { describe, expect, it } from 'vitest'
import { chargeDaily, pruneDailyBudget } from './budget.ts'
import { createHarness, START, testEnv } from './test/harness.ts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('pruneDailyBudget retention', () => {
  it('keeps the row on the first retained day and prunes only the day before it', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const me = (await (
      await h.send({ path: '/api/me', cookies: { rca_session: token } })
    ).json()) as {
      user: { id: string }
    }
    const db = testEnv().DB
    // START is 2026-01-15 12:00 UTC, so the retention cutoff is the 2026-01-08 row.
    await chargeDaily(db, me.user.id, 'read', START - 8 * DAY_MS)
    await chargeDaily(db, me.user.id, 'read', START - 7 * DAY_MS)
    await chargeDaily(db, me.user.id, 'read', START - 6 * DAY_MS)

    expect(await pruneDailyBudget(db, START)).toBe(1)
    const { results } = await db
      .prepare('SELECT day FROM daily_budget WHERE user_id = ? ORDER BY day')
      .bind(me.user.id)
      .all<{ day: string }>()
    expect(results.map((row) => row.day)).toEqual(['2026-01-08', '2026-01-09'])
  })
})
