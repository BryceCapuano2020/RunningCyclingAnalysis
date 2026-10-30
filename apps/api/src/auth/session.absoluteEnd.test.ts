import { describe, expect, it } from 'vitest'
import { createHarness, START } from '../test/harness.ts'

const DAY = 24 * 60 * 60 * 1000

describe('a session past its absolute lifetime', () => {
  // The refresh path caps a stored expiry at the absolute end, so this guard only matters for a row that
  // holds a later expiry; it must still refuse that row on its own.
  it('is refused even when its stored expiry runs later', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await h.env.DB.prepare('UPDATE sessions SET expires_at = ?')
      .bind(START + 200 * DAY)
      .run()
    h.clock.now = START + 91 * DAY
    const res = await h.send({ path: '/api/me', cookies: { rca_session: token } })
    expect(res.status).toBe(200)
    expect(await res.json()).toBeNull()
  })
})
