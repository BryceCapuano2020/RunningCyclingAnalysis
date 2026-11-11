import { ANALYSIS_REVISION } from '@rca/core/stateSnapshot'
import { afterEach, describe, expect, it } from 'vitest'
import { racingDb } from '../test/racingDb.ts'
import {
  afterNewest,
  fakeBatch,
  libraryDigests,
  seedDigests,
  stateWorld,
} from '../test/stateKit.ts'
import { handleStateBatch } from './consumer.ts'
import { forgetUnstored, withComputeLock } from './lock.ts'
import { runStateJob } from './job.ts'

const digests = libraryDigests()

afterEach(forgetUnstored)

async function prepared() {
  const w = await stateWorld()
  w.h.clock.now = afterNewest(digests)
  await seedDigests(w.env.DB, w.userId, digests)
  return w
}

const stored = async (w: Awaited<ReturnType<typeof prepared>>) =>
  (await w.env.FILES!.list({ prefix: `users/${w.userId}/state/` })).objects.length

describe('the consumer and the isolate lock', () => {
  it('retries every message for an account whose isolate is computing, acknowledges none, and computes it after', async () => {
    const w = await prepared()
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const held = withComputeLock(() => gate)
    const { batch, acked, retried } = fakeBatch([w.userId, w.userId])
    const report = await handleStateBatch(batch, w.env, w.deps)
    expect(report).toEqual({ accounts: 1, outcomes: { busy: 1 } })
    expect(acked).toEqual([])
    expect(retried).toEqual([
      { id: 0, delaySeconds: 5 },
      { id: 1, delaySeconds: 5 },
    ])
    expect(await stored(w)).toBe(0)
    release()
    await held
    const again = fakeBatch([w.userId])
    expect((await handleStateBatch(again.batch, w.env, w.deps)).outcomes).toEqual({ written: 1 })
    expect(again.acked).toEqual([0])
  })

  it("acknowledges without computing when the stored snapshot is a later Worker's", async () => {
    const w = await prepared()
    await runStateJob(w.env, w.deps, w.userId)
    await w.env.DB.batch([
      w.env.DB.prepare('UPDATE state_jobs SET analysis_revision = ? WHERE user_id = ?').bind(
        ANALYSIS_REVISION + 1,
        w.userId,
      ),
      w.env.DB.prepare('UPDATE users SET library_version = library_version + 1 WHERE id = ?').bind(
        w.userId,
      ),
    ])
    let reads = 0
    const env = {
      ...w.env,
      DB: racingDb(w.env.DB, /SELECT id, created_at, digest_json/, async () => void (reads += 1)),
    }
    w.h.clock.now += 120_000
    const { batch, acked, retried } = fakeBatch([w.userId])
    expect(await handleStateBatch(batch, env, w.deps)).toEqual({
      accounts: 1,
      outcomes: { newer: 1 },
    })
    expect(acked).toEqual([0])
    expect(retried).toEqual([])
    expect(reads).toBe(0)
  })

  it('computes nothing for an account deleted after the job began, and puts no object', async () => {
    const w = await prepared()
    const env = {
      ...w.env,
      DB: racingDb(w.env.DB, /r2_storage_budget/, async () => {
        await w.env.DB.prepare('UPDATE users SET deleting_at = 1 WHERE id = ?').bind(w.userId).run()
      }),
    }
    expect(await runStateJob(env, w.deps, w.userId)).toBe('gone')
    expect(await stored(w)).toBe(0)
  })

  it('treats a lift write during the input read as moved, and records nothing', async () => {
    const w = await prepared()
    const env = {
      ...w.env,
      DB: racingDb(w.env.DB, /SELECT id, created_at, digest_json/, async () => {
        await w.env.DB.prepare('UPDATE users SET lift_revision = lift_revision + 1 WHERE id = ?')
          .bind(w.userId)
          .run()
      }),
    }
    expect(await runStateJob(env, w.deps, w.userId)).toBe('moved')
    expect(await stored(w)).toBe(0)
    const row = await w.env.DB.prepare(
      'SELECT computed_lift_revision AS l, snapshot_hash AS h FROM state_jobs WHERE user_id = ?',
    )
      .bind(w.userId)
      .first<{ l: number; h: string | null }>()
    expect(row).toEqual({ l: 0, h: null })
    expect(await runStateJob(w.env, w.deps, w.userId)).toBe('deferred')
  })
})
