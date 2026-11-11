import { StateSnapshotSchema } from '@rca/contract'
import { RESULT_REVISION } from '../state/resultRevision.ts'
import { afterEach, describe, expect, it } from 'vitest'
import { createHarness } from '../test/harness.ts'
import { racingDb } from '../test/racingDb.ts'
import { afterNewest, libraryDigests, seedDigests, stateWorld } from '../test/stateKit.ts'
import { STATE_CLAIM_SECONDS } from '../state/message.ts'
import { forgetUnstored, withComputeLock } from '../state/lock.ts'
import { runStateJob } from '../state/job.ts'

/** Compute on read (docs/design/server-authority.md): what GET /api/state does for each state of the stored row. */
const digests = libraryDigests()
const DAY = 86_400_000
const CLAIM_MS = STATE_CLAIM_SECONDS * 1000

afterEach(forgetUnstored)

async function ready() {
  const w = await stateWorld()
  w.h.clock.now = afterNewest(digests)
  await seedDigests(w.env.DB, w.userId, digests)
  await runStateJob(w.env, w.deps, w.userId)
  const row = () =>
    w.env.DB.prepare(
      `SELECT snapshot_hash AS hash, computed_version AS version, snapshot_lift_revision AS lift,
         analysis_revision AS rev, snapshot_now_ms AS now FROM state_jobs WHERE user_id = ?`,
    )
      .bind(w.userId)
      .first<{ hash: string; version: number; lift: number; rev: number; now: number }>()
  const used = async () =>
    (
      await w.env.DB.prepare(
        "SELECT coalesce(sum(used), 0) AS n FROM daily_budget WHERE action = 'stateRead'",
      ).first<{ n: number }>()
    )?.n
  return {
    ...w,
    row,
    used,
    // Each read is a claim's window after the last, so a stale one computes (the claim itself is tested below).
    get: (headers: Record<string, string> = {}) => {
      w.h.clock.now += CLAIM_MS + 1
      return w.h.send({ path: '/api/state', cookies: w.cookies, headers })
    },
  }
}

/** Counts the reads of digests (one per compute: the library is one page), and runs `hook` at the first. */
function countingDb(db: D1Database, reads: { n: number }, hook?: () => Promise<void>) {
  const counted = new Proxy(db, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop, target)
      if (prop !== 'prepare' || typeof value !== 'function') {
        return typeof value === 'function' ? value.bind(target) : value
      }
      return (sql: string) => {
        if (/SELECT id, created_at, digest_json/.test(sql)) reads.n += 1
        return Reflect.apply(value, target, [sql])
      }
    },
  })
  return hook === undefined
    ? counted
    : racingDb(counted, /SELECT id, created_at, digest_json/, hook)
}

describe('compute on read', () => {
  it('serves a write in the response that follows it, stores it, and is a 304 after', async () => {
    const w = await ready()
    const first = await w.row()
    // A ride in the hour before now, which no figure ignores; the clock stays inside the session's life.
    const extra = { ...digests[0]!, startMs: w.h.clock.now - 1_800_000, id: 'extra' }
    await seedDigests(w.env.DB, w.userId, [extra], 5_000)
    w.h.clock.now += 60_000
    const res = await w.get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { libraryVersion: number }
    expect(StateSnapshotSchema.safeParse(body).success).toBe(true)
    const after = await w.row()
    expect(body.libraryVersion).toBe(after!.version)
    expect(after!.version).toBeGreaterThan(first!.version)
    expect(res.headers.get('ETag')).toBe(`"${after!.hash}"`)
    expect(res.headers.get('X-State-Now')).toBe(String(w.h.clock.now))
    const again = await w.get({ 'If-None-Match': `"${after!.hash}"` })
    expect(again.status).toBe(304)
    expect(again.headers.get('X-State-Now')).toBe(String(after!.now))
  })

  it('recomputes for a lift write, a lower stored revision and an aged day, and for nothing else', async () => {
    const w = await ready()
    const tag = (await w.row())!.hash
    expect((await w.get({ 'If-None-Match': `"${tag}"` })).status).toBe(304)
    expect(await w.used()).toBe(0)
    await w.env.DB.prepare('UPDATE users SET lift_revision = lift_revision + 1 WHERE id = ?')
      .bind(w.userId)
      .run()
    expect((await w.get({ 'If-None-Match': `"${tag}"` })).status).toBe(304)
    expect((await w.row())!.lift).toBe(1)
    await w.env.DB.prepare('UPDATE state_jobs SET analysis_revision = ? WHERE user_id = ?')
      .bind(RESULT_REVISION - 1, w.userId)
      .run()
    expect((await w.get()).status).toBe(200)
    expect((await w.row())!.rev).toBe(RESULT_REVISION)
    const before = (await w.row())!.now
    w.h.clock.now += 2 * DAY
    expect((await w.get()).status).toBe(200)
    expect((await w.row())!.now).toBe(w.h.clock.now)
    expect(before).toBeLessThan(w.h.clock.now)
  })

  it('moves snapshot_now_ms for a recompute with the same figures, so the next read is a 304 with the new X-State-Now', async () => {
    // An account with no activities, and a version bump that moves no figure: the hash is the same, so only the order
    // columns move. (A day roll is not this case since the snapshot carries `lift.today`: it is a new hash, below.)
    const w = await stateWorld()
    await runStateJob(w.env, w.deps, w.userId)
    const get = (headers: Record<string, string>) => {
      w.h.clock.now += CLAIM_MS + 1
      return w.h.send({ path: '/api/state', cookies: w.cookies, headers })
    }
    const read = () =>
      w.env.DB.prepare(
        'SELECT snapshot_hash AS hash, snapshot_now_ms AS now FROM state_jobs WHERE user_id = ?',
      )
        .bind(w.userId)
        .first<{ hash: string; now: number }>()
    const before = (await read())!
    await w.env.DB.prepare('UPDATE users SET library_version = library_version + 3 WHERE id = ?')
      .bind(w.userId)
      .run()
    const res = await get({ 'If-None-Match': `"${before.hash}"` })
    const after = (await read())!
    expect(after.hash).toBe(before.hash)
    expect(res.status).toBe(304)
    expect(res.headers.get('X-State-Now')).toBe(String(w.h.clock.now))
    expect(after.now).toBe(w.h.clock.now)
    const next = await get({ 'If-None-Match': `"${after.hash}"` })
    expect(next.status).toBe(304)
    expect(next.headers.get('X-State-Now')).toBe(String(after.now))
    expect(
      await w.env.DB.prepare("SELECT used FROM daily_budget WHERE action = 'stateRead'").first<{
        used: number
      }>(),
    ).toEqual({ used: 1 })
  })

  it('computes again for an aged day, which is a new snapshot (it names the day), and stamps the instant', async () => {
    const w = await stateWorld()
    await runStateJob(w.env, w.deps, w.userId)
    const before = await w.env.DB.prepare(
      'SELECT snapshot_hash AS hash FROM state_jobs WHERE user_id = ?',
    )
      .bind(w.userId)
      .first<{ hash: string }>()
    w.h.clock.now = Math.ceil(w.h.clock.now / DAY) * DAY + 60_000
    const res = await w.h.send({
      path: '/api/state',
      cookies: w.cookies,
      headers: { 'If-None-Match': `"${before!.hash}"` },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).not.toBe(`"${before!.hash}"`)
    expect(res.headers.get('X-State-Now')).toBe(String(w.h.clock.now))
  })

  it('computes a later Worker snapshot once per isolate, stores nothing, and answers 304 after', async () => {
    const w = await ready()
    const stored = await w.row()
    await w.env.DB.prepare('UPDATE state_jobs SET analysis_revision = ? WHERE user_id = ?')
      .bind(RESULT_REVISION + 1, w.userId)
      .run()
    const keysBefore = (await w.env.FILES!.list({ prefix: `users/${w.userId}/state/` })).objects
    const reads = { n: 0 }
    const h = createHarness({}, { DB: countingDb(w.env.DB, reads) })
    h.clock.now = w.h.clock.now + CLAIM_MS + 1
    const get = (headers: Record<string, string> = {}) =>
      h.send({ path: '/api/state', cookies: w.cookies, headers })
    const first = await get()
    expect(first.status).toBe(200)
    const tag = first.headers.get('ETag')!
    expect((await get({ 'If-None-Match': tag })).status).toBe(304)
    expect((await get({ 'If-None-Match': tag })).status).toBe(304)
    expect((await get()).status).toBe(200)
    expect(reads.n).toBe(1)
    const row = await w.row()
    expect(row).toMatchObject({ rev: RESULT_REVISION + 1, hash: stored!.hash })
    expect((await w.env.FILES!.list({ prefix: `users/${w.userId}/state/` })).objects).toEqual(
      keysBefore,
    )
    // A write is a new key: the isolate computes again.
    await w.env.DB.prepare('UPDATE users SET library_version = library_version + 1 WHERE id = ?')
      .bind(w.userId)
      .run()
    expect((await get({ 'If-None-Match': tag })).status).toBeLessThan(400)
    expect(reads.n).toBe(2)
  })

  it('leaves a later Worker object alone when it checks the metadata: only a lower revision resets the row', async () => {
    const w = await ready()
    const { hash } = (await w.row())!
    const key = `users/${w.userId}/state/${hash}.json.gz`
    const object = await w.env.FILES!.get(key)
    const bytes = new Uint8Array(await object!.arrayBuffer())
    const put = (resultRevision?: string) =>
      w.env.FILES!.put(key, bytes, {
        httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip' },
        ...(resultRevision === undefined ? {} : { customMetadata: { resultRevision } }),
      })
    // An older Worker's object under the row's own revision: computed again in this read and written back.
    await put()
    expect((await w.get()).status).toBe(200)
    expect((await w.env.FILES!.head(key))?.customMetadata?.resultRevision).toBe(
      String(RESULT_REVISION),
    )
    expect((await w.row())!.rev).toBe(RESULT_REVISION)
    // A later Worker's object is not reset.
    await put(String(RESULT_REVISION + 1))
    expect((await w.get()).status).toBe(200)
    expect((await w.row())!.rev).toBe(RESULT_REVISION)
  })

  it('answers 202 computing with Retry-After for no stored snapshot under the lock, and serves the stored one with X-State-Current 0', async () => {
    const w = await ready()
    await w.env.DB.prepare('UPDATE users SET lift_revision = lift_revision + 1 WHERE id = ?')
      .bind(w.userId)
      .run()
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const reads = { n: 0 }
    const h = createHarness({}, { DB: countingDb(w.env.DB, reads, () => gate) })
    h.clock.now = w.h.clock.now + CLAIM_MS + 1
    const get = () => h.send({ path: '/api/state', cookies: w.cookies })
    const computing = get()
    while (reads.n === 0) await new Promise((resolve) => setTimeout(resolve, 1))
    const hash = (await w.row())!.hash
    const under = await get()
    expect(under.status).toBe(200)
    expect(under.headers.get('X-State-Current')).toBe('0')
    expect(under.headers.get('ETag')).toBe(`"${hash}"`)
    await w.env.DB.prepare('UPDATE state_jobs SET analysis_revision = 0 WHERE user_id = ?')
      .bind(w.userId)
      .run()
    const none = await get()
    expect(none.status).toBe(202)
    expect(none.headers.get('Retry-After')).toBe('2')
    expect(await none.json()).toEqual({ state: 'computing' })
    expect(await w.used()).toBe(1)
    release()
    expect((await computing).status).toBe(200)
    expect(reads.n).toBe(1)
  })

  it('reads the inputs again once when a lift write lands during the read, and answers the later revision', async () => {
    const w = await ready()
    await w.env.DB.prepare('UPDATE users SET lift_revision = lift_revision + 1 WHERE id = ?')
      .bind(w.userId)
      .run()
    const reads = { n: 0 }
    // The first read runs long (the clock moves 8 s) and a lift write lands during it.
    const bump = async () => {
      h.clock.now += 8_000
      await w.env.DB.prepare('UPDATE users SET lift_revision = lift_revision + 1 WHERE id = ?')
        .bind(w.userId)
        .run()
    }
    const h = createHarness({}, { DB: countingDb(w.env.DB, reads, bump) })
    h.clock.now = w.h.clock.now + CLAIM_MS + 1
    const res = await h.send({ path: '/api/state', cookies: w.cookies })
    expect(res.status).toBe(200)
    expect(reads.n).toBe(2)
    // The claim was stamped again before the second read, so another isolate does not claim in the gap.
    const stamped = await w.env.DB.prepare(
      'SELECT attempted_at AS a, claim_until AS c FROM state_jobs WHERE user_id = ?',
    )
      .bind(w.userId)
      .first<{ a: number; c: number }>()
    expect(stamped?.a).toBe(h.clock.now)
    // ... and the finished compute freed the claim.
    expect(stamped?.c).toBe(0)
    expect((await w.row())!.lift).toBe(2)
    expect(await w.used()).toBe(1)
  })

  it('serves what is stored, or 202, while another isolate holds the claim, and computes once the window has passed', async () => {
    const w = await ready()
    await w.env.DB.prepare('UPDATE users SET lift_revision = lift_revision + 1 WHERE id = ?')
      .bind(w.userId)
      .run()
    const reads = { n: 0 }
    const h = createHarness({}, { DB: countingDb(w.env.DB, reads) })
    const get = () => h.send({ path: '/api/state', cookies: w.cookies })
    // Another isolate claimed a moment ago (it holds claim_until; the stored snapshot is still the old one).
    h.clock.now = w.h.clock.now + 1_000
    await w.env.DB.prepare('UPDATE state_jobs SET claim_until = ? WHERE user_id = ?')
      .bind(h.clock.now + CLAIM_MS - 1, w.userId)
      .run()
    const held = await get()
    expect(held.status).toBe(200)
    expect(held.headers.get('X-State-Current')).toBe('0')
    expect(reads.n).toBe(0)
    expect(await w.used()).toBe(0)
    await w.env.DB.prepare('UPDATE state_jobs SET analysis_revision = 0 WHERE user_id = ?')
      .bind(w.userId)
      .run()
    expect((await get()).status).toBe(202)
    h.clock.now += CLAIM_MS + 1
    expect((await get()).status).toBe(200)
    expect(reads.n).toBe(1)
  })

  it('computes once for two stale reads at the same moment, and the other is served what is stored', async () => {
    const w = await ready()
    await w.env.DB.prepare('UPDATE users SET lift_revision = lift_revision + 1 WHERE id = ?')
      .bind(w.userId)
      .run()
    const reads = { n: 0 }
    const h = createHarness({}, { DB: countingDb(w.env.DB, reads) })
    h.clock.now = w.h.clock.now + CLAIM_MS + 1
    const get = () => h.send({ path: '/api/state', cookies: w.cookies })
    const both = await Promise.all([get(), get()])
    expect(both.map((res) => res.status)).toEqual([200, 200])
    expect(both.filter((res) => res.headers.get('X-State-Current') === '0')).toHaveLength(1)
    expect(reads.n).toBe(1)
    expect(await w.used()).toBe(1)
  })

  it('stamps nothing and defers no one for a read over the budget, and answers no X-State-Now for a row never stamped', async () => {
    const w = await ready()
    await w.env.DB.prepare('UPDATE users SET lift_revision = lift_revision + 1 WHERE id = ?')
      .bind(w.userId)
      .run()
    await w.env.DB.prepare('UPDATE state_jobs SET attempted_at = 5 WHERE user_id = ?')
      .bind(w.userId)
      .run()
    await w.env.DB.prepare(
      `INSERT INTO daily_budget (user_id, day, action, used) VALUES (?, ?, 'stateRead', ?)`,
    )
      .bind(w.userId, new Date(w.h.clock.now + CLAIM_MS + 1).toISOString().slice(0, 10), 300)
      .run()
    // Stale, over budget: the stored copy is still free, and nothing is claimed.
    const free = await w.get()
    expect(free.status).toBe(200)
    expect(free.headers.get('X-State-Current')).toBe('0')
    const row = await w.env.DB.prepare('SELECT attempted_at AS a FROM state_jobs WHERE user_id = ?')
      .bind(w.userId)
      .first<{ a: number }>()
    expect(row?.a).toBe(5)
    // No stored copy this build can serve: the refusal stands.
    await w.env.DB.prepare('UPDATE state_jobs SET analysis_revision = 0 WHERE user_id = ?')
      .bind(w.userId)
      .run()
    expect((await w.get()).status).toBe(429)
  })

  it('names no X-State-Now for a row no compute has stamped', async () => {
    const w = await ready()
    await w.env.DB.prepare('UPDATE state_jobs SET snapshot_now_ms = 0 WHERE user_id = ?')
      .bind(w.userId)
      .run()
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const held = withComputeLock(() => gate)
    try {
      const { hash } = (await w.row())!
      const res = await w.get({ 'If-None-Match': `"${hash}"` })
      expect(res.status).toBe(304)
      expect(res.headers.get('X-State-Current')).toBe('0')
      expect(res.headers.get('X-State-Now')).toBeNull()
    } finally {
      release()
      await held
    }
  })
})
