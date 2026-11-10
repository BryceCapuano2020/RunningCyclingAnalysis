import { describe, expect, it } from 'vitest'
import { runMaintenance } from '../maintenance.ts'
import { AFTER_GRACE, at } from '../test/maintenance.ts'
import { afterNewest, libraryDigests, seedDigests, stateWorld } from '../test/stateKit.ts'
import { runStateJob } from './job.ts'

const digests = libraryDigests()

async function ready(email = 'rider@example.com') {
  const w = await stateWorld({ email })
  w.h.clock.now = afterNewest(digests)
  await seedDigests(w.env.DB, w.userId, digests)
  await runStateJob(w.env, w.deps, w.userId)
  const keys = async () =>
    (await w.env.FILES!.list({ prefix: `users/${w.userId}/` })).objects.map((o) => o.key)
  return { ...w, keys, current: (await keys())[0]! }
}

describe('results snapshots and the sweeps', () => {
  it('the orphan sweep keeps the snapshot the job row names, and removes older ones and those of a gone account', async () => {
    const w = await ready()
    const old = `users/${w.userId}/state/${'0'.repeat(32)}.json.gz`
    const gone = `users/no-such-account/state/${'1'.repeat(32)}.json.gz`
    await w.env.FILES!.put(old, 'old')
    await w.env.FILES!.put(gone, 'gone')
    const report = await runMaintenance(w.env, at(AFTER_GRACE))
    expect(report.orphansDeleted).toBe(2)
    expect(await w.keys()).toEqual([w.current])
    expect((await w.env.FILES!.head(gone)) === null).toBe(true)
  })

  it('leaves a snapshot younger than the grace period, which its job row may not name yet', async () => {
    const w = await ready()
    const fresh = `users/${w.userId}/state/${'2'.repeat(32)}.json.gz`
    await w.env.FILES!.put(fresh, 'fresh')
    const report = await runMaintenance(w.env, at(w.h.clock.now))
    expect(report.orphansDeleted).toBe(0)
    expect(await w.keys()).toContain(fresh)
  })

  it('deleting the account deletes the snapshot with it', async () => {
    const w = await ready()
    expect(await w.keys()).toEqual([w.current])
    const res = await w.h.send({ method: 'DELETE', path: '/api/me', cookies: w.cookies })
    expect(res.status).toBe(204)
    expect(await w.keys()).toEqual([])
    const row = await w.env.DB.prepare('SELECT COUNT(*) AS n FROM state_jobs').first<{
      n: number
    }>()
    expect(row?.n).toBe(0)
  })

  it('turning original files off sweeps the originals but not the snapshot', async () => {
    const w = await ready()
    const original = `users/${w.userId}/some-activity`
    await w.env.FILES!.put(original, 'file')
    await w.env.DB.prepare('UPDATE activities SET file_key = ?, file_size = 4 WHERE rowid = 1')
      .bind(original)
      .run()
    const on = { massKg: 70, bikeMassKg: 9, units: 'metric', keepFiles: true }
    expect(
      (await w.h.send({ method: 'PUT', path: '/api/profile', json: on, cookies: w.cookies }))
        .status,
    ).toBe(200)
    const off = { ...on, keepFiles: false }
    expect(
      (await w.h.send({ method: 'PUT', path: '/api/profile', json: off, cookies: w.cookies }))
        .status,
    ).toBe(200)
    expect(await w.keys()).toEqual([w.current])
  })
})
