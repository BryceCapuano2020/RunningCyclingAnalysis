import { describe, expect, it, vi } from 'vitest'
import { systemDeps } from '../deps.ts'
import worker from '../index.ts'
import {
  afterNewest,
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

  it('asks for a retry of an account whose job failed, and logs the class only', async () => {
    const w = await prepared()
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { batch, acked, retried } = fakeBatch([w.userId, w.userId])
    const report = await handleStateBatch(batch, { ...w.env, FILES: undefined }, w.deps)
    expect(report).toEqual({ accounts: 1, outcomes: { failed: 1 } })
    expect(acked).toEqual([])
    expect(retried).toEqual([
      { id: 0, delaySeconds: 30 },
      { id: 1, delaySeconds: 30 },
    ])
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
