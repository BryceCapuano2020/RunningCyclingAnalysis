import { describe, expect, it } from 'vitest'
import { runMaintenance } from '../maintenance.ts'
import { stateWorld } from '../test/stateKit.ts'
import { clearPending } from './pending.ts'
import { resendDirty } from './resend.ts'

describe('the daily re-send', () => {
  it('sends one message for a listed account left dirty with none on its way, and none while one is', async () => {
    // Signing in made a profile, which raised the counter: dirty, and no write sent anything.
    const w = await stateWorld()
    const now = w.h.clock.now
    expect(await resendDirty(w.env, now)).toBe(1)
    expect(w.sent).toEqual([{ body: { userId: w.userId }, options: { delaySeconds: 10 } }])
    expect(await resendDirty(w.env, now + 1_000)).toBe(0)
    // Its message lost, the marker lapses, and the next run sends again.
    expect(await resendDirty(w.env, now + 130_000)).toBe(1)
    expect(w.sent).toHaveLength(2)
  })

  it('leaves alone a current account, one off the list, everyone by *, and a Worker with no queue', async () => {
    const w = await stateWorld()
    const now = w.h.clock.now
    await w.env.DB.prepare(
      `INSERT INTO state_jobs (user_id, computed_version)
       SELECT id, library_version FROM users WHERE id = ?`,
    )
      .bind(w.userId)
      .run()
    expect(await resendDirty(w.env, now)).toBe(0)
    await w.env.DB.prepare('UPDATE users SET library_version = library_version + 1 WHERE id = ?')
      .bind(w.userId)
      .run()
    await clearPending(w.env.DB, w.userId)
    for (const list of ['someone-else', '*', '']) {
      expect(await resendDirty({ ...w.env, SERVER_COMPUTE_USERS: list }, now)).toBe(0)
    }
    expect(await resendDirty({ ...w.env, STATE_QUEUE: undefined }, now)).toBe(0)
    expect(w.sent).toEqual([])
    expect(await resendDirty(w.env, now)).toBe(1)
  })

  it('leaves a library the server does not compute for to the browser', async () => {
    const w = await stateWorld()
    await w.env.DB.prepare('UPDATE users SET activity_count = 2001 WHERE id = ?')
      .bind(w.userId)
      .run()
    expect(await resendDirty(w.env, w.h.clock.now)).toBe(0)
  })

  it('runs in the daily maintenance', async () => {
    const w = await stateWorld()
    const report = await runMaintenance(w.env, w.deps)
    expect(report.stateResent).toBe(1)
    expect(w.sent).toHaveLength(1)
  })
})
