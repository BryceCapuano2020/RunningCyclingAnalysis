import { describe, expect, it } from 'vitest'
import { chargeDaily } from './budget.ts'
import { createHarness, START } from './test/harness.ts'

describe('refunding a daily charge', () => {
  // Refunds are single-shot at every call site today; this holds the line if one is ever repeated,
  // since a negative counter would mint extra budget for the rest of the day.
  it('leaves the counter at zero when the same charge is refunded twice', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const me = (await (
      await h.send({ path: '/api/me', cookies: { rca_session: token } })
    ).json()) as { user: { id: string } }
    const charge = await chargeDaily(h.env.DB, me.user.id, 'read', START)
    await charge.refund()
    await charge.refund()
    const row = await h.env.DB.prepare('SELECT used FROM daily_budget WHERE user_id = ?')
      .bind(me.user.id)
      .first<{ used: number }>()
    expect(row?.used).toBe(0)
  })
})
