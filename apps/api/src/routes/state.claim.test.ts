import { afterEach, describe, expect, it } from 'vitest'
import { createHarness } from '../test/harness.ts'
import { racingDb } from '../test/racingDb.ts'
import { forgetUnstored } from '../state/lock.ts'
import { runStateJob } from '../state/job.ts'
import { afterNewest, libraryDigests, seedDigests, stateWorld } from '../test/stateKit.ts'

/** The compute claim is held while a compute runs, not for a window after it (docs/design/server-authority.md). */
const digests = libraryDigests()

afterEach(forgetUnstored)

async function ready() {
  const w = await stateWorld()
  w.h.clock.now = afterNewest(digests)
  await seedDigests(w.env.DB, w.userId, digests)
  await runStateJob(w.env, w.deps, w.userId)
  const get = () => w.h.send({ path: '/api/state', cookies: w.cookies })
  const write = (id: string) =>
    seedDigests(
      w.env.DB,
      w.userId,
      [{ ...digests[0]!, startMs: w.h.clock.now - 1_800_000, id }],
      5_000,
    )
  return { ...w, get, write }
}

const DIGEST_READ = /SELECT id, created_at, digest_json/

/** Runs `hook` just before each of the first `times` reads of digests (a write landing during a compute's reads). */
function eachRead(db: D1Database, hook: () => Promise<void>, times: number) {
  let n = 0
  return new Proxy(db, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop, target)
      if (prop !== 'prepare' || typeof value !== 'function') {
        return typeof value === 'function' ? value.bind(target) : value
      }
      return (sql: string) => {
        const fresh =
          DIGEST_READ.test(sql) && n < times ? racingDb(target, DIGEST_READ, hook) : target
        if (fresh !== target) n += 1
        return fresh.prepare(sql)
      }
    },
  })
}

/** Throws at the first read of digests: a compute that fails. */
function failingRead(db: D1Database, reads: { n: number }) {
  return new Proxy(db, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop, target)
      if (prop !== 'prepare' || typeof value !== 'function') {
        return typeof value === 'function' ? value.bind(target) : value
      }
      return (sql: string) => {
        if (DIGEST_READ.test(sql)) {
          reads.n += 1
          throw new Error('digest read failed')
        }
        return Reflect.apply(value, target, [sql])
      }
    },
  })
}

describe('compute claim release', () => {
  it('computes in the read that follows an import, with no wait after the last compute', async () => {
    const w = await ready()
    w.h.clock.now += 20_000
    await w.write('first')
    const one = await w.get()
    expect(one.headers.get('X-State-Current')).not.toBe('0')
    // A second import a second later: the read computes at once, not 10 s on.
    w.h.clock.now += 1_000
    await w.write('second')
    const two = await w.get()
    expect(two.status).toBe(200)
    expect(two.headers.get('X-State-Current')).not.toBe('0')
    expect(two.headers.get('X-State-Now')).toBe(String(w.h.clock.now))
  })

  it('still computes once for two stale reads at the same moment', async () => {
    const w = await ready()
    w.h.clock.now += 20_000
    await w.write('burst')
    const both = await Promise.all([w.get(), w.get()])
    expect(both.filter((res) => res.headers.get('X-State-Current') === '0')).toHaveLength(1)
  })

  it('leaves the queue coalescing a burst after a compute in a read', async () => {
    const w = await ready()
    w.h.clock.now += 20_000
    await w.write('one')
    await w.get()
    w.h.clock.now += 1_000
    await w.write('two')
    // The read finished and released its claim, but the compute still began under the queue's interval.
    expect(await runStateJob(w.env, w.deps, w.userId)).toBe('deferred')
    expect(await runStateJob(w.env, w.deps, w.userId)).toBe('deferred')
  })

  it('frees the claim when a read ends without a finished compute (a write during both input reads)', async () => {
    const w = await ready()
    w.h.clock.now += 20_000
    await w.write('landing')
    const bump = () =>
      w.env.DB.prepare('UPDATE users SET lift_revision = lift_revision + 1 WHERE id = ?')
        .bind(w.userId)
        .run()
        .then(() => undefined)
    const racing = createHarness({}, { DB: eachRead(w.env.DB, bump, Infinity) })
    racing.clock.now = w.h.clock.now
    const first = await racing.send({ path: '/api/state', cookies: w.cookies })
    expect(first.status).toBe(202)
    // A second later the same inputs are still uncovered, and the read computes: the claim was not left held.
    w.h.clock.now += 1_000
    const second = await w.get()
    expect(second.headers.get('X-State-Current')).not.toBe('0')
  })

  it('holds the claim for minutes after a failed compute, and keeps its unit charged, so a failure that repeats is not recomputed by every poll', async () => {
    const w = await ready()
    w.h.clock.now += 20_000
    await w.write('failing')
    const used = async () =>
      (
        await w.env.DB.prepare(
          "SELECT used FROM daily_budget WHERE action = 'stateRead' AND user_id = ?",
        )
          .bind(w.userId)
          .first<{ used: number }>()
      )?.used ?? 0
    const before = await used()
    const reads = { n: 0 }
    const failing = createHarness({}, { DB: failingRead(w.env.DB, reads) })
    failing.clock.now = w.h.clock.now
    await failing.send({ path: '/api/state', cookies: w.cookies })
    expect(reads.n).toBe(1)
    // The failed compute is paid for: a user whose compute fails every time reaches the daily cap.
    expect(await used()).toBe(before + 1)
    // A visible tab polls every minute: none of them recomputes for the next minutes.
    for (let minute = 0; minute < 4; minute += 1) {
      failing.clock.now += 60_000
      await failing.send({ path: '/api/state', cookies: w.cookies })
    }
    expect(reads.n).toBe(1)
    // The hold passes and it tries again.
    failing.clock.now += 120_000
    await failing.send({ path: '/api/state', cookies: w.cookies })
    expect(reads.n).toBe(2)
  })

  it('holds a claim that lapsed without a release (a crash, no catch run) like a failure, so each poll does not recompute and crash again', async () => {
    const w = await ready()
    w.h.clock.now += 20_000
    await w.write('crashing')
    // The compute began 61 s ago and was killed: its claim lapsed and nothing released it.
    await w.env.DB.prepare('UPDATE state_jobs SET claim_until = ? WHERE user_id = ?')
      .bind(w.h.clock.now - 1_000, w.userId)
      .run()
    for (let minute = 0; minute < 4; minute += 1) {
      w.h.clock.now += 60_000
      const read = await w.get()
      expect(read.headers.get('X-State-Current')).toBe('0')
    }
    // The hold passes (five minutes after the claim lapsed) and it computes.
    w.h.clock.now += 120_000
    const again = await w.get()
    expect(again.headers.get('X-State-Current')).not.toBe('0')
  })
})
