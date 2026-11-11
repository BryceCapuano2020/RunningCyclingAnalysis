import { StateSnapshotSchema } from '@rca/contract'
import { LIFT_REVISION } from '@rca/core/lift'
import { ANALYSIS_REVISION, STATE_SNAPSHOT_VERSION, liftOfSnapshot } from '@rca/core/stateSnapshot'
import { afterEach, describe, expect, it } from 'vitest'
import { runStateJob } from '../state/job.ts'
import { STATE_CLAIM_SECONDS } from '../state/message.ts'
import { forgetUnstored } from '../state/lock.ts'
import { RESULT_REVISION, resultRevisionOf } from '../state/resultRevision.ts'
import { afterNewest, libraryDigests, seedDigests, stateWorld } from '../test/stateKit.ts'
import { liftSet } from '../test/lifts.ts'

/** The result revision (analysis revision, snapshot version, lift revision) and the lift sets in the snapshot (docs/design/server-authority.md). */
const digests = libraryDigests()
const CLAIM_MS = STATE_CLAIM_SECONDS * 1000

afterEach(forgetUnstored)

async function ready() {
  const w = await stateWorld()
  w.h.clock.now = afterNewest(digests)
  await seedDigests(w.env.DB, w.userId, digests)
  await runStateJob(w.env, w.deps, w.userId)
  const row = () =>
    w.env.DB.prepare(
      'SELECT snapshot_hash AS hash, analysis_revision AS rev FROM state_jobs WHERE user_id = ?',
    )
      .bind(w.userId)
      .first<{ hash: string; rev: number }>()
  const keys = async () =>
    (await w.env.FILES!.list({ prefix: `users/${w.userId}/state/` })).objects.map((o) => o.key)
  const setRevision = (rev: number) =>
    w.env.DB.prepare('UPDATE state_jobs SET analysis_revision = ? WHERE user_id = ?')
      .bind(rev, w.userId)
      .run()
  const get = (headers: Record<string, string> = {}) => {
    w.h.clock.now += CLAIM_MS + 1
    return w.h.send({ path: '/api/state', cookies: w.cookies, headers })
  }
  return { ...w, row, keys, setRevision, get }
}

const [A, S, L] = [ANALYSIS_REVISION, STATE_SNAPSHOT_VERSION, LIFT_REVISION]

describe('the result revision', () => {
  it('orders the tuple as the three parts in turn, and is what this build names', () => {
    const ordered = [
      resultRevisionOf(A - 1, 999, 999),
      resultRevisionOf(A, S - 1, 999),
      resultRevisionOf(A, S, L - 1),
      RESULT_REVISION,
      resultRevisionOf(A, S, L + 1),
      resultRevisionOf(A, S + 1, 0),
      resultRevisionOf(A + 1, 0, 0),
    ]
    expect(ordered).toEqual([...ordered].sort((a, b) => a - b))
    expect(new Set(ordered).size).toBe(ordered.length)
    expect(RESULT_REVISION).toBe(resultRevisionOf(A, S, L))
    expect(() => resultRevisionOf(1000, 0, 0)).toThrow()
    expect(() => resultRevisionOf(0, -1, 0)).toThrow()
  })
})

describe('GET /api/state against the stored result revision', () => {
  it.each([
    ['a snapshot of an earlier schema version', resultRevisionOf(A, S - 1, L)],
    ['one made under an earlier lift estimator', resultRevisionOf(A, S, L - 1)],
    [
      'one made under an earlier analysis, whatever its other parts',
      resultRevisionOf(A - 1, 999, 999),
    ],
  ])(
    "computes %s again, and writes this build's revision to the row and the object",
    async (_name, stored) => {
      const w = await ready()
      const first = (await w.row())!
      await w.setRevision(stored)
      const res = await w.get({ 'If-None-Match': `"${first.hash}"` })
      // The figures are the same, so the tag is: a version bump that moves no figure answers 304, and stores the new revision.
      expect(res.status).toBe(304)
      expect((await w.row())!.rev).toBe(RESULT_REVISION)
      const object = await w.env.FILES!.head(`users/${w.userId}/state/${first.hash}.json.gz`)
      expect(object?.customMetadata?.resultRevision).toBe(String(RESULT_REVISION))
    },
  )

  it('computes in the request when the stored snapshot is below the build, and counts it', async () => {
    const w = await ready()
    await w.setRevision(resultRevisionOf(A, S - 1, L))
    const res = await w.get()
    expect(res.status).toBe(200)
    expect(StateSnapshotSchema.safeParse(await res.json()).success).toBe(true)
    expect((await w.row())!.rev).toBe(RESULT_REVISION)
  })

  it('treats a stored object that names a lower result revision as stale, and computes again', async () => {
    const w = await ready()
    const { hash } = (await w.row())!
    const key = `users/${w.userId}/state/${hash}.json.gz`
    const bytes = new Uint8Array(await (await w.env.FILES!.get(key))!.arrayBuffer())
    await w.env.FILES!.put(key, bytes, {
      httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip' },
      customMetadata: { resultRevision: String(resultRevisionOf(A, S - 1, L)) },
    })
    expect((await w.get()).status).toBe(200)
    expect((await w.env.FILES!.head(key))?.customMetadata?.resultRevision).toBe(
      String(RESULT_REVISION),
    )
  })

  it.each([
    ['a higher schema version', resultRevisionOf(A, S + 1, 0)],
    ['a higher lift estimator', resultRevisionOf(A, S, L + 1)],
    ['a higher analysis, with lower later parts', resultRevisionOf(A + 1, 0, 0)],
  ])('serves %s from the isolate and never overwrites it', async (_name, stored) => {
    const w = await ready()
    const before = { row: await w.row(), keys: await w.keys() }
    await w.setRevision(stored)
    const first = await w.get()
    expect(first.status).toBe(200)
    expect(StateSnapshotSchema.safeParse(await first.json()).success).toBe(true)
    const tag = first.headers.get('ETag')!
    expect((await w.get({ 'If-None-Match': tag })).status).toBe(304)
    expect(await w.row()).toEqual({ hash: before.row!.hash, rev: stored })
    expect(await w.keys()).toEqual(before.keys)
    // The job leaves it alone too.
    w.h.clock.now += 2 * 86_400_000
    expect(await runStateJob(w.env, w.deps, w.userId)).toBe('newer')
    expect(await w.row()).toEqual({ hash: before.row!.hash, rev: stored })
  })
})

describe('the lift sets in the snapshot', () => {
  it('reach the results, and a lift write makes the stored snapshot not current', async () => {
    const w = await ready()
    const first = await w.get()
    const before = liftOfSnapshot(await first.json())
    expect(before?.state.lifts ?? []).toEqual([])
    const sets = [1, 2, 3].map((n) => liftSet(n, { date: '2026-03-02', reps: 5, loadKg: 90 + n }))
    const put = await w.h.send({
      method: 'PUT',
      path: '/api/lifts',
      json: { sets },
      cookies: w.cookies,
    })
    expect(put.status).toBe(200)
    // The write sent a message for the account, and the next read computes with the sets in it.
    expect(w.sent.map((m) => m.body.userId)).toContain(w.userId)
    const next = await w.get({ 'If-None-Match': first.headers.get('ETag')! })
    expect(next.status).toBe(200)
    expect(next.headers.get('ETag')).not.toBe(first.headers.get('ETag'))
    const after = liftOfSnapshot(await next.json())
    expect(after?.state.lifts.map((l) => l.key)).toEqual(['back-squat.barbell'])
  })
})
