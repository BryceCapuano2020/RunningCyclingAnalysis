import { RESULT_REVISION } from './resultRevision.ts'
import { MAX_ACTIVITIES_PER_USER } from '@rca/contract'
import { describe, expect, it } from 'vitest'
import { MAX_MAINTENANCE_OPERATIONS, runMaintenance } from '../maintenance.ts'
import { stateWorld } from '../test/stateKit.ts'
import { clearPending } from './pending.ts'
import { MAX_RESEND_ACCOUNTS, resendDirty } from './resend.ts'

describe('the daily re-send', () => {
  it('sends one message for an account left dirty with none on its way, and none while one is', async () => {
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

  it('leaves alone a current account, one a later Worker computed, and a Worker with no queue', async () => {
    const w = await stateWorld()
    const now = w.h.clock.now
    await w.env.DB.prepare(
      `INSERT INTO state_jobs (user_id, computed_version, snapshot_version, analysis_revision)
       SELECT id, library_version, library_version, ? FROM users WHERE id = ?`,
    )
      .bind(RESULT_REVISION, w.userId)
      .run()
    expect(await resendDirty(w.env, now)).toBe(0)
    // The same compute made under the analysis revision before is stale: a deploy moved how a figure is worked out.
    await w.env.DB.prepare('UPDATE state_jobs SET analysis_revision = ? WHERE user_id = ?')
      .bind(RESULT_REVISION - 1, w.userId)
      .run()
    expect(await resendDirty(w.env, now)).toBe(1)
    await clearPending(w.env.DB, w.userId)
    w.sent.length = 0
    await w.env.DB.prepare('UPDATE state_jobs SET analysis_revision = ? WHERE user_id = ?')
      .bind(RESULT_REVISION, w.userId)
      .run()
    await w.env.DB.prepare('UPDATE users SET library_version = library_version + 1 WHERE id = ?')
      .bind(w.userId)
      .run()
    await clearPending(w.env.DB, w.userId)
    expect(await resendDirty({ ...w.env, STATE_QUEUE: undefined }, now)).toBe(0)
    expect(w.sent).toEqual([])
    // A stored revision above this build's is a later Worker's: dirty inputs or not, it is not re-sent.
    await w.env.DB.prepare('UPDATE state_jobs SET analysis_revision = ? WHERE user_id = ?')
      .bind(RESULT_REVISION + 1, w.userId)
      .run()
    expect(await resendDirty(w.env, now)).toBe(0)
    await w.env.DB.prepare('UPDATE state_jobs SET analysis_revision = ? WHERE user_id = ?')
      .bind(RESULT_REVISION, w.userId)
      .run()
    expect(await resendDirty(w.env, now)).toBe(1)
  })

  it('sends for every account, the one whose last compute began longest ago first, at most the limit', async () => {
    const w = await stateWorld()
    const ids = [w.userId]
    for (const email of ['b@example.com', 'c@example.com']) {
      const token = await w.h.signIn(email)
      const me = (await (
        await w.h.send({ path: '/api/me', cookies: { rca_session: token } })
      ).json()) as { user: { id: string } }
      ids.push(me.user.id)
    }
    // Attempted most recently, longest ago, and never: never first, then longest ago.
    const attempted = [3_000, 1_000, 0]
    for (const [i, id] of ids.entries()) {
      await w.env.DB.prepare(
        'INSERT INTO state_jobs (user_id, attempted_at) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET attempted_at = ?2',
      )
        .bind(id, attempted[i])
        .run()
    }
    w.sent.length = 0
    expect(await resendDirty(w.env, w.h.clock.now, 2)).toBe(2)
    expect(w.sent.map((m) => m.body.userId)).toEqual([ids[2], ids[1]])
    expect(await resendDirty(w.env, w.h.clock.now, 0)).toBe(0)
    // The rest follow once the first two have messages on their way.
    expect(await resendDirty(w.env, w.h.clock.now)).toBe(1)
    expect(w.sent.at(-1)?.body.userId).toBe(ids[0])
  })

  it('stops within the maintenance operation budget and reports what it sent', async () => {
    const w = await stateWorld()
    for (let i = 0; i < 24; i += 1) await w.h.signIn(`many-${i}@example.com`)
    w.sent.length = 0
    const report = await runMaintenance(w.env, w.deps)
    expect(report.operations).toBeLessThanOrEqual(MAX_MAINTENANCE_OPERATIONS)
    expect(report.stateResent).toBeGreaterThan(0)
    expect(report.stateResent).toBeLessThanOrEqual(MAX_RESEND_ACCOUNTS)
    expect(report.stateResent).toBe(w.sent.length)
  })

  it('sends for an account at the activity quota: no account falls back to the browser', async () => {
    const w = await stateWorld()
    await w.env.DB.prepare('UPDATE users SET activity_count = ? WHERE id = ?')
      .bind(MAX_ACTIVITIES_PER_USER, w.userId)
      .run()
    expect(await resendDirty(w.env, w.h.clock.now)).toBe(1)
  })

  it('runs in the daily maintenance', async () => {
    const w = await stateWorld()
    const report = await runMaintenance(w.env, w.deps)
    expect(report.stateResent).toBe(1)
    expect(w.sent).toHaveLength(1)
  })
})
