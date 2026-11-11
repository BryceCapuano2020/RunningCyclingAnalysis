import { afterEach, describe, expect, it } from 'vitest'
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
})
