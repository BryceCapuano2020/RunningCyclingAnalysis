import { describe, expect, it } from 'vitest'
import { afterNewest, libraryDigests, seedDigests, stateWorld } from '../test/stateKit.ts'
import { runStateJob } from './job.ts'
import { computeAndStore } from './refresh.ts'
import { isCurrent, jobRow } from './row.ts'

const digests = libraryDigests()

describe('what the row says a compute covers', () => {
  it("never says a version is covered while another job's snapshot is stored for it", async () => {
    const w = await stateWorld()
    w.h.clock.now = afterNewest(digests)
    await seedDigests(w.env.DB, w.userId, digests)
    await runStateJob(w.env, w.deps, w.userId)
    const setting = (period: number | null) =>
      w.h.send({
        method: 'PUT',
        path: '/api/settings',
        json: { keepPower: null, countedRuns: null, period },
        cookies: w.cookies,
      })
    // A request reads the row (hash H0), and a setting is then flipped, the queue stores H1, and it is flipped back.
    const seen = (await jobRow(w.env.DB, w.userId))!
    w.h.clock.now += 20_000
    expect((await setting(14)).status).toBe(200)
    const queue = await computeAndStore(
      w.env,
      w.deps,
      w.userId,
      (await jobRow(w.env.DB, w.userId))!,
      true,
    )
    expect(queue.kind).toBe('written')
    const h1 = (await jobRow(w.env.DB, w.userId))!
    w.h.clock.now += 20_000
    expect((await setting(null)).status).toBe(200)
    // The request computes from the inputs now (H0's figures again, at the later version) against the row it read.
    const request = await computeAndStore(w.env, w.deps, w.userId, seen, true, true)
    expect(request.kind).toBe('unchanged')
    const row = (await jobRow(w.env.DB, w.userId))!
    expect(row.snapshot_hash).toBe(h1.snapshot_hash)
    expect(row.snapshot_version).toBe(h1.snapshot_version)
    expect(row.computed_version).toBe(h1.computed_version)
    expect(isCurrent(row, w.h.clock.now)).toBe(false)
  })
})
