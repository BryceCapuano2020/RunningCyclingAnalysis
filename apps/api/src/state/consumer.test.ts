import { describe, expect, it, vi } from 'vitest'
import { systemDeps } from '../deps.ts'
import worker from '../index.ts'
import {
  afterNewest,
  failingDb,
  failingPuts,
  fakeBatch,
  libraryDigests,
  seedDigests,
  stateWorld,
} from '../test/stateKit.ts'
import { handleStateBatch } from './consumer.ts'

const digests = libraryDigests()

async function prepared(options: { on?: boolean } = {}) {
  const w = await stateWorld(options)
  w.h.clock.now = afterNewest(digests)
  await seedDigests(w.env.DB, w.userId, digests)
  return w
}

const hashOf = (w: Awaited<ReturnType<typeof prepared>>) =>
  w.env.DB.prepare('SELECT snapshot_hash AS h FROM state_jobs WHERE user_id = ?')
    .bind(w.userId)
    .first<{ h: string }>()

describe('the state consumer', () => {
  it('runs one job for an account however many messages name it, and acknowledges them all', async () => {
    const w = await prepared()
    const { batch, acked, retried } = fakeBatch([w.userId, w.userId, w.userId])
    const report = await handleStateBatch(batch, w.env, w.deps)
    expect(report).toEqual({ accounts: 1, outcomes: { written: 1 } })
    expect(acked).toEqual([0, 1, 2])
    expect(retried).toEqual([])
    expect((await hashOf(w))?.h).toMatch(/^[0-9a-f]{32}$/)
  })

  it('runs the accounts one after another and answers each its own way', async () => {
    const w = await prepared()
    w.env.SERVER_COMPUTE_USERS = `${w.userId},no-such-account`
    const { batch, acked } = fakeBatch([w.userId, 'no-such-account'])
    const report = await handleStateBatch(batch, w.env, w.deps)
    expect(report).toEqual({ accounts: 2, outcomes: { written: 1, gone: 1 } })
    expect(acked).toEqual([0, 1])
  })

  it('asks for one retry of an account whose job failed, spends its other messages, and logs the class only', async () => {
    const w = await prepared()
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { batch, acked, retried } = fakeBatch([w.userId, w.userId])
    const report = await handleStateBatch(batch, { ...w.env, FILES: undefined }, w.deps)
    expect(report).toEqual({ accounts: 1, outcomes: { failed: 1 } })
    expect(acked).toEqual([1])
    expect(retried).toEqual([{ id: 0, delaySeconds: 30 }])
    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]?.[0]).toBe('{"event":"state_job_failed","errorClass":"Error"}')
    log.mockRestore()
  })

  it('drops the messages of an account off the allowlist, and computes one on it', async () => {
    const off = await prepared({ on: false })
    const dropped = fakeBatch([off.userId])
    expect(await handleStateBatch(dropped.batch, off.env, off.deps)).toEqual({
      accounts: 1,
      outcomes: { not_listed: 1 },
    })
    expect(dropped.acked).toEqual([0])
    expect(await hashOf(off)).toBeNull()
    // Listed among others, with stray spaces: computed.
    off.env.SERVER_COMPUTE_USERS = ` other-id , ${off.userId} `
    const listed = fakeBatch([off.userId])
    expect(await handleStateBatch(listed.batch, off.env, off.deps)).toEqual({
      accounts: 1,
      outcomes: { written: 1 },
    })
  })

  it('answers a burst with one delayed message, not one per write, and computes when the interval has passed', async () => {
    const w = await prepared()
    await handleStateBatch(fakeBatch([w.userId]).batch, w.env, w.deps)
    w.sent.length = 0
    await w.env.DB.prepare('UPDATE users SET library_version = library_version + 1 WHERE id = ?')
      .bind(w.userId)
      .run()
    w.h.clock.now += 5_000
    const burst = fakeBatch([w.userId, w.userId, w.userId])
    const report = await handleStateBatch(burst.batch, w.env, w.deps)
    expect(report).toEqual({ accounts: 1, outcomes: { deferred: 1 } })
    expect(burst.acked).toEqual([0, 1, 2])
    expect(w.sent).toEqual([{ body: { userId: w.userId }, options: { delaySeconds: 30 } }])
    // The delayed message finds the interval spent and computes.
    w.h.clock.now += 30_000
    const later = await handleStateBatch(fakeBatch([w.userId]).batch, w.env, w.deps)
    expect(later.outcomes).toEqual({ unchanged: 1 })
    expect(w.sent).toHaveLength(1)
  })

  it('sends the follow-up of a deferred message whose own write set the marker', async () => {
    const w = await prepared()
    await handleStateBatch(fakeBatch([w.userId]).batch, w.env, w.deps)
    // A write within the interval, through the route as in production: it sets the marker and sends.
    w.h.clock.now += 5_000
    w.sent.length = 0
    const write = await w.h.send({
      method: 'PUT',
      path: '/api/settings',
      json: { keepPower: ['a'], countedRuns: null, period: null },
      cookies: w.cookies,
    })
    expect(write.status).toBe(200)
    expect(w.sent).toHaveLength(1)
    // Its message arrives 10 s later, still inside the interval: deferred, and the follow-up is sent all the same.
    w.h.clock.now += 10_000
    const arrived = fakeBatch([w.userId])
    expect((await handleStateBatch(arrived.batch, w.env, w.deps)).outcomes).toEqual({ deferred: 1 })
    expect(arrived.acked).toEqual([0])
    expect(w.sent).toHaveLength(2)
    expect(w.sent[1]).toEqual({ body: { userId: w.userId }, options: { delaySeconds: 30 } })
    // Which computes the write once the interval is spent (the same figures: no ride has that id).
    w.h.clock.now += 30_000
    expect((await handleStateBatch(fakeBatch([w.userId]).batch, w.env, w.deps)).outcomes).toEqual({
      unchanged: 1,
    })
  })

  it('retries the messages when the delayed one cannot be sent', async () => {
    const w = await prepared()
    await handleStateBatch(fakeBatch([w.userId]).batch, w.env, w.deps)
    await w.env.DB.prepare('UPDATE users SET library_version = library_version + 1 WHERE id = ?')
      .bind(w.userId)
      .run()
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const down = {
      send: async () => {
        throw new Error('queue down')
      },
    } as unknown as Queue<{ userId: string }>
    const { batch, acked, retried } = fakeBatch([w.userId])
    const report = await handleStateBatch(batch, { ...w.env, STATE_QUEUE: down }, w.deps)
    expect(report.outcomes).toEqual({ deferred: 1, failed: 1 })
    expect(acked).toEqual([])
    expect(retried).toHaveLength(1)
    log.mockRestore()
  })

  it('computes a failing account once per retry, however many messages and batches name it', async () => {
    const w = await prepared()
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const tries = { count: 0 }
    const env = { ...w.env, FILES: failingPuts(w.env.FILES!, tries) }
    // An import's worth of messages arriving a second apart, two to a batch: the first computes and fails.
    const answers = []
    for (let i = 0; i < 5; i += 1) {
      const answer = fakeBatch([w.userId, w.userId])
      await handleStateBatch(answer.batch, env, w.deps)
      answers.push(answer)
      w.h.clock.now += 1_000
    }
    expect(tries.count).toBe(1)
    expect(answers.flatMap((answer) => answer.retried)).toHaveLength(1)
    // The rest defer: each deferred batch sends one message in place of the ones it spent, never more, and none computes.
    expect(answers.flatMap((answer) => answer.acked)).toHaveLength(9)
    expect(w.sent).toHaveLength(4)
    w.sent.length = 0
    // The retry, its interval spent, computes once more, and its own retries after it: no more than the Queue's limit.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      w.h.clock.now += 30_000
      await handleStateBatch(fakeBatch([w.userId]).batch, env, w.deps)
    }
    expect(tries.count).toBe(4)
    expect(w.sent).toEqual([])
    log.mockRestore()
  })

  it('retries one message, and does not throw, when the job tables cannot be written', async () => {
    const w = await prepared()
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // Migration 0015 not applied, say: the marker's column is not there.
    const env = { ...w.env, DB: failingDb(w.env.DB, /pending_until/) }
    const { batch, acked, retried } = fakeBatch([w.userId, w.userId])
    expect((await handleStateBatch(batch, env, w.deps)).outcomes).toEqual({ failed: 1 })
    expect(acked).toEqual([1])
    expect(retried).toHaveLength(1)
    log.mockRestore()
  })

  it('holds the messages in read-only mode', async () => {
    const held = await prepared()
    const waiting = fakeBatch([held.userId])
    await handleStateBatch(waiting.batch, { ...held.env, READ_ONLY: 'true' }, held.deps)
    expect(waiting.all.retried).toBe(true)
    expect(await hashOf(held)).toBeNull()
  })

  it('is what the Worker runs for its queue, and logs counts only', async () => {
    const w = await prepared()
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { batch, acked } = fakeBatch([w.userId])
    await worker.queue(batch, w.env)
    expect(acked).toEqual([0])
    expect(log).toHaveBeenCalledWith(
      '{"event":"state_batch","accounts":1,"outcomes":{"written":1}}',
    )
    log.mockRestore()
    expect(systemDeps.now()).toBeGreaterThan(0)
  })
})
