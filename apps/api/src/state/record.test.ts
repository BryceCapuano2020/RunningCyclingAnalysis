import { RESULT_REVISION } from './resultRevision.ts'
import { describe, expect, it } from 'vitest'
import { stateWorld } from '../test/stateKit.ts'
import {
  claimCompute,
  claimWaitMs,
  record,
  releaseClaim,
  restampClaim,
  type Covered,
} from './record.ts'

const at = (version: number, liftRevision: number, nowMs: number): Covered => ({
  version,
  liftRevision,
  nowMs,
  at: nowMs,
})

async function fresh() {
  const w = await stateWorld()
  await claimCompute(w.env.DB, w.userId, 1, 0)
  const read = () =>
    w.env.DB.prepare(
      `SELECT snapshot_hash AS hash, snapshot_version AS v, snapshot_lift_revision AS l, snapshot_now_ms AS now,
         computed_version AS cv, snapshot_lift_revision AS sl, analysis_revision AS rev
       FROM state_jobs WHERE user_id = ?`,
    )
      .bind(w.userId)
      .first()
  return { ...w, read }
}

describe('the snapshot order: (revision, version, lift revision, instant)', () => {
  it('takes a later instant, version or lift revision, and refuses the same or an earlier one', async () => {
    const w = await fresh()
    expect((await record(w.env.DB, w.userId, at(5, 2, 1000), 'h1', null)).held).toBe('h1')
    // The same coordinates, an earlier instant, a lower version, a lower lift revision: all refused.
    for (const covered of [at(5, 2, 1000), at(5, 2, 900), at(4, 9, 9999), at(5, 1, 9999)]) {
      expect((await record(w.env.DB, w.userId, covered, 'h2', null)).held).toBe('h1')
    }
    expect(await w.read()).toMatchObject({ hash: 'h1', v: 5, l: 2, now: 1000 })
    expect((await record(w.env.DB, w.userId, at(5, 2, 1001), 'h3', null)).held).toBe('h3')
    expect((await record(w.env.DB, w.userId, at(5, 3, 1001), 'h4', null)).held).toBe('h4')
    expect((await record(w.env.DB, w.userId, at(6, 0, 1001), 'h5', null)).held).toBe('h5')
    expect(await w.read()).toMatchObject({ hash: 'h5', v: 6, l: 0, now: 1001 })
  })

  it('moves only the order columns on the unchanged path, and only for the hash it matched', async () => {
    const w = await fresh()
    await record(w.env.DB, w.userId, at(5, 2, 1000), 'h1', null)
    await record(w.env.DB, w.userId, at(5, 2, 2000), null, 'h1')
    expect(await w.read()).toMatchObject({ hash: 'h1', now: 2000 })
    // Another job stored h2 meanwhile: the stale match does not stamp its day.
    await record(w.env.DB, w.userId, at(6, 2, 2500), 'h2', null)
    await record(w.env.DB, w.userId, at(6, 2, 9000), null, 'h1')
    expect(await w.read()).toMatchObject({ hash: 'h2', now: 2500 })
  })

  it('takes any snapshot over a lower revision, and leaves a later revision alone', async () => {
    const w = await fresh()
    await record(w.env.DB, w.userId, at(9, 9, 9000), 'h1', null)
    await w.env.DB.prepare('UPDATE state_jobs SET analysis_revision = ? WHERE user_id = ?')
      .bind(RESULT_REVISION - 1, w.userId)
      .run()
    expect((await record(w.env.DB, w.userId, at(1, 0, 10), 'h2', null)).held).toBe('h2')
    expect(await w.read()).toMatchObject({ rev: RESULT_REVISION, v: 1, cv: 1 })
    await w.env.DB.prepare('UPDATE state_jobs SET analysis_revision = ? WHERE user_id = ?')
      .bind(RESULT_REVISION + 1, w.userId)
      .run()
    expect((await record(w.env.DB, w.userId, at(50, 50, 50_000), 'h3', null)).held).toBe('h2')
    expect(await w.read()).toMatchObject({ rev: RESULT_REVISION + 1, v: 1, cv: 1 })
  })

  it('never lowers the coverage within a revision', async () => {
    const w = await fresh()
    await record(w.env.DB, w.userId, at(7, 3, 1000), 'h1', null)
    await record(w.env.DB, w.userId, at(2, 1, 1), null, 'h1')
    expect(await w.read()).toMatchObject({ cv: 7, l: 3 })
  })

  it('lets one claim win a window, any isolate, and the next once it has passed or been released', async () => {
    const w = await stateWorld()
    // No row yet (a new account): the claim makes it.
    expect(await claimCompute(w.env.DB, w.userId, 100_000, 10_000)).toBe(110_000)
    expect(await claimCompute(w.env.DB, w.userId, 100_001, 10_000)).toBeNull()
    expect(await claimCompute(w.env.DB, w.userId, 109_999, 10_000)).toBeNull()
    expect(await claimCompute(w.env.DB, w.userId, 110_000, 10_000)).toBe(120_000)
    // A release of a stamp that is no longer the row's leaves the claim; its own stamp frees it.
    await releaseClaim(w.env.DB, w.userId, 110_000)
    expect(await claimCompute(w.env.DB, w.userId, 111_000, 10_000)).toBeNull()
    await releaseClaim(w.env.DB, w.userId, 120_000)
    expect(await claimCompute(w.env.DB, w.userId, 111_000, 10_000)).toBe(121_000)
    // A restamp holds only the claim it names: one lost (lapsed, taken by another) is null.
    expect(await restampClaim(w.env.DB, w.userId, 112_000, 10_000, 121_000)).toBe(122_000)
    expect(await restampClaim(w.env.DB, w.userId, 113_000, 10_000, 121_000)).toBeNull()
  })

  it('treats a lapsed claim nobody released as a crash for a read, which waits out the failure hold; the queue does not', async () => {
    const w = await stateWorld()
    const HOLD = 300_000
    expect(await claimCompute(w.env.DB, w.userId, 100_000, 60_000, HOLD)).toBe(160_000)
    // The compute died (a CPU-limit kill runs no catch): its claim lapses at 160 s and is not released.
    expect(await claimCompute(w.env.DB, w.userId, 161_000, 60_000, HOLD)).toBeNull()
    expect(await claimCompute(w.env.DB, w.userId, 160_000 + HOLD - 1, 60_000, HOLD)).toBeNull()
    expect(await claimCompute(w.env.DB, w.userId, 160_000 + HOLD, 60_000, HOLD)).toBe(
      160_000 + HOLD + 60_000,
    )
    // The queue retries a failure itself, so it is not held by one.
    await releaseClaim(w.env.DB, w.userId, 160_000 + HOLD + 60_000)
    await claimCompute(w.env.DB, w.userId, 1_000_000, 60_000, HOLD)
    expect(await claimCompute(w.env.DB, w.userId, 1_061_000, 60_000)).toBe(1_121_000)
  })

  it('says how long a claim has left, for a message that found it held: its own window, or the failure hold after it lapsed', async () => {
    const w = await stateWorld()
    const HOLD = 300_000
    expect(await claimWaitMs(w.env.DB, w.userId, 100_000, HOLD)).toBe(0)
    await claimCompute(w.env.DB, w.userId, 100_000, 60_000, HOLD)
    expect(await claimWaitMs(w.env.DB, w.userId, 130_000, HOLD)).toBe(30_000)
    // Lapsed and not released: held for the failure hold after it lapsed.
    expect(await claimWaitMs(w.env.DB, w.userId, 200_000, HOLD)).toBe(160_000 + HOLD - 200_000)
    await releaseClaim(w.env.DB, w.userId, 160_000)
    expect(await claimWaitMs(w.env.DB, w.userId, 200_000, HOLD)).toBe(0)
  })
})
