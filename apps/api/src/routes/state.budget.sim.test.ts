import { DAILY_LIMITS } from '@rca/contract'
import { afterEach, describe, expect, it } from 'vitest'
import { runStateJob } from '../state/job.ts'
import { forgetUnstored } from '../state/lock.ts'
import { afterNewest, libraryDigests, seedDigests, stateWorld } from '../test/stateKit.ts'

const digests = libraryDigests()
const DAY = 86_400_000
const MINUTE = 60_000

afterEach(forgetUnstored)

describe('the state read budget over a day', () => {
  it('stays inside the daily allowance for a tab that asks every 60 s, through a day roll and a write every hour', async () => {
    const w = await stateWorld()
    w.h.clock.now = afterNewest(digests)
    await seedDigests(w.env.DB, w.userId, digests)
    await runStateJob(w.env, w.deps, w.userId)
    // The next UTC midnight: the first read of the day finds a snapshot from the day before.
    w.h.clock.now = Math.ceil(w.h.clock.now / DAY) * DAY + MINUTE
    const day = new Date(w.h.clock.now).toISOString().slice(0, 10)
    let tag = ''
    for (let minute = 0; minute < 1440; minute += 1) {
      if (minute > 0 && minute % 60 === 0) {
        await w.env.DB.prepare('UPDATE users SET lift_revision = lift_revision + 1 WHERE id = ?')
          .bind(w.userId)
          .run()
      }
      const res = await w.h.send({
        path: '/api/state',
        cookies: w.cookies,
        headers: tag === '' ? {} : { 'If-None-Match': tag },
      })
      expect([200, 304]).toContain(res.status)
      const next = res.headers.get('ETag')!
      tag = next
      w.h.clock.now += MINUTE
    }
    const used = (
      await w.env.DB.prepare("SELECT used FROM daily_budget WHERE action = 'stateRead' AND day = ?")
        .bind(day)
        .first<{ used: number }>()
    )?.used
    // The day roll and 23 hourly writes are 24 computes, charged; the other 1,416 polls are 304s and free.
    expect(used).toBe(24)
    expect(used).toBeLessThanOrEqual(DAILY_LIMITS.stateRead)
  })
})
