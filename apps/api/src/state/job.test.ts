import {
  MAX_ACTIVITIES_PER_USER,
  StateSnapshotSchema,
  StoredActivityDigestSchema,
} from '@rca/contract'
import { analysisSettings, bodyMassOn } from '@rca/core/athlete'
import { UTC_ZONE, setViewerZone, withViewerZone } from '@rca/core/calendar'
import { dayOf } from '@rca/core/customRange'
import { liftResultsOf } from '@rca/core/lift'
import { AnalysisSession } from '@rca/core/session'
import { toSnapshot } from '@rca/core/stateSnapshot'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { racingDb } from '../test/racingDb.ts'
import {
  afterNewest,
  failingPuts,
  libraryDigests,
  seedDigests,
  stateWorld,
} from '../test/stateKit.ts'
import { RESULT_REVISION } from './resultRevision.ts'
import { runStateJob } from './job.ts'
import { computeAndStore } from './refresh.ts'
import { jobRow } from './row.ts'
import { zoneNamed } from './zone.ts'

const digests = libraryDigests()

async function prepared(settings?: Record<string, unknown>) {
  const w = await stateWorld()
  w.h.clock.now = afterNewest(digests)
  await seedDigests(w.env.DB, w.userId, digests)
  if (settings) {
    expect(
      (await w.h.send({ method: 'PUT', path: '/api/settings', json: settings, cookies: w.cookies }))
        .status,
    ).toBe(200)
  }
  return w
}

async function row(w: Awaited<ReturnType<typeof prepared>>) {
  return w.env.DB.prepare(
    'SELECT computed_version, computed_at, snapshot_hash, snapshot_version FROM state_jobs WHERE user_id = ?',
  )
    .bind(w.userId)
    .first<{
      computed_version: number
      computed_at: number
      snapshot_hash: string | null
      snapshot_version: number
    }>()
}

async function nowMsOf(w: Awaited<ReturnType<typeof prepared>>): Promise<number> {
  const found = await w.env.DB.prepare(
    'SELECT snapshot_now_ms AS n FROM state_jobs WHERE user_id = ?',
  )
    .bind(w.userId)
    .first<{ n: number }>()
  return found!.n
}

async function version(w: Awaited<ReturnType<typeof prepared>>): Promise<number> {
  const found = await w.env.DB.prepare('SELECT library_version AS v FROM users WHERE id = ?')
    .bind(w.userId)
    .first<{ v: number }>()
  return found!.v
}

async function stored(w: Awaited<ReturnType<typeof prepared>>) {
  const keys = (await w.env.FILES!.list({ prefix: `users/${w.userId}/state/` })).objects.map(
    (object) => object.key,
  )
  return keys
}

async function read(w: Awaited<ReturnType<typeof prepared>>, hash: string) {
  const object = await w.env.FILES!.get(`users/${w.userId}/state/${hash}.json.gz`)
  return JSON.parse(gunzipSync(Buffer.from(await object!.arrayBuffer())).toString()) as unknown
}

describe('the state job', () => {
  it('computes what the browser computes, from the account inputs, in the account zone', async () => {
    const zone = 'Pacific/Auckland'
    const w = await prepared({
      keepPower: ['ride-a'],
      countedRuns: null,
      period: 42,
      zone,
    })
    await w.h.send({
      method: 'PUT',
      path: '/api/profile',
      json: {
        massKg: 71.5,
        bikeMassKg: 8,
        units: 'metric',
        keepFiles: false,
        birthYear: 1990,
        sex: 'female',
      },
      cookies: w.cookies,
    })
    const measurement = { kind: 'massKg', value: 70, from: '2026-01-01' }
    await w.h.send({
      method: 'PUT',
      path: '/api/measurements',
      json: measurement,
      cookies: w.cookies,
    })
    const nowMs = w.h.clock.now

    expect(await runStateJob(w.env, w.deps, w.userId)).toBe('written')
    const saved = await row(w)
    const snapshot = (await read(w, saved!.snapshot_hash!)) as { state: unknown }
    expect(StateSnapshotSchema.safeParse(snapshot).success).toBe(true)

    // What the page does: the stored digests read as the listing reads them, the settings the page builds, one session in the zone.
    const parsed = digests.map((d) =>
      StoredActivityDigestSchema.parse(JSON.parse(JSON.stringify(d))),
    )
    const viewerZone = zoneNamed(zone)
    const before = setViewerZone(UTC_ZONE)
    try {
      const massKg = withViewerZone(viewerZone, () =>
        bodyMassOn(71.5, [measurement as never], nowMs),
      )
      expect(massKg).toBe(70)
      const session = new AnalysisSession(undefined, viewerZone)
      session.clock = () => nowMs
      session.choosePeriod(42)
      const settings = analysisSettings(
        { massKg, bikeMassKg: 8 },
        [measurement as never],
        1990,
        [],
        ['ride-a'],
        'female',
      )
      const state = session.loadDigests(parsed, settings)
      const meta = { libraryVersion: saved!.snapshot_version, nowMs, zone, buildSha: 'unknown' }
      // The lift results of an account with no sets, as of its local day, and the check-in the session makes.
      const expected = toSnapshot(state, meta, {
        lift: withViewerZone(viewerZone, () => liftResultsOf([], settings, dayOf(nowMs))),
        checkIn: session.checkInSnapshot(state, nowMs),
      })
      expect(snapshot).toStrictEqual(JSON.parse(JSON.stringify(expected)))
    } finally {
      setViewerZone(before)
    }
  })

  it('records the version it read, and does nothing while nothing has moved', async () => {
    const w = await prepared()
    const v = await version(w)
    expect(await runStateJob(w.env, w.deps, w.userId)).toBe('written')
    expect(await row(w)).toMatchObject({ computed_version: v, snapshot_version: v })
    expect(await runStateJob(w.env, w.deps, w.userId)).toBe('current')
  })

  it('defers a compute that follows another within the minimum interval, and runs it after', async () => {
    const w = await prepared()
    expect(await runStateJob(w.env, w.deps, w.userId)).toBe('written')
    const first = await row(w)
    await w.env.DB.prepare('UPDATE users SET library_version = library_version + 1 WHERE id = ?')
      .bind(w.userId)
      .run()
    w.h.clock.now += 29_000
    expect(await runStateJob(w.env, w.deps, w.userId)).toBe('deferred')
    expect(await row(w)).toEqual(first)
    w.h.clock.now += 1_000
    expect(await runStateJob(w.env, w.deps, w.userId)).toBe('unchanged')
    expect((await row(w))!.computed_version).toBe(first!.computed_version + 1)
  })

  it('writes nothing when a recompute gives the same figures, and still records the version', async () => {
    const w = await prepared()
    await runStateJob(w.env, w.deps, w.userId)
    const first = await row(w)
    const [key] = await stored(w)
    // A change that moves the counter but no figure: the next compute has the same hash.
    await w.env.DB.prepare('UPDATE users SET library_version = library_version + 3 WHERE id = ?')
      .bind(w.userId)
      .run()
    w.h.clock.now += 60_000
    const puts: string[] = []
    const watched = new Proxy(w.env.FILES!, {
      get(target, prop) {
        const value: unknown = Reflect.get(target, prop, target)
        if (prop === 'put') return (k: string) => void puts.push(k)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    expect(await runStateJob({ ...w.env, FILES: watched }, w.deps, w.userId)).toBe('unchanged')
    expect(puts).toEqual([])
    const second = await row(w)
    expect(second).toMatchObject({
      computed_version: first!.computed_version + 3,
      snapshot_hash: first!.snapshot_hash,
      // The order columns move on the unchanged path too (the day, the version), so the next read is a 304.
      snapshot_version: first!.computed_version + 3,
      computed_at: w.h.clock.now,
    })
    expect(await nowMsOf(w)).toBe(w.h.clock.now)
    expect(await stored(w)).toEqual([key])
  })

  it('writes the new object and deletes the old one when the figures change', async () => {
    const w = await prepared()
    await runStateJob(w.env, w.deps, w.userId)
    const first = await row(w)
    const extra = { ...digests[0]!, startMs: digests[0]!.startMs + 400 * 86_400_000, id: 'extra-1' }
    await seedDigests(w.env.DB, w.userId, [extra], 5_000)
    w.h.clock.now = extra.startMs + 7_200_000
    expect(await runStateJob(w.env, w.deps, w.userId)).toBe('written')
    const second = await row(w)
    expect(second!.snapshot_hash).not.toBe(first!.snapshot_hash)
    expect(second!.snapshot_version).toBeGreaterThan(first!.snapshot_version)
    expect(await stored(w)).toEqual([`users/${w.userId}/state/${second!.snapshot_hash}.json.gz`])
  })

  it('leaves a read that a write overtook alone: its own job follows', async () => {
    const w = await prepared()
    const before = await version(w)
    const env = {
      ...w.env,
      DB: racingDb(w.env.DB, /SELECT id, created_at, digest_json/, async () => {
        await w.env.DB.prepare(
          'UPDATE users SET library_version = library_version + 1 WHERE id = ?',
        )
          .bind(w.userId)
          .run()
      }),
    }
    expect(await runStateJob(env, w.deps, w.userId)).toBe('moved')
    // The attempt is recorded, and nothing computed: no version, no snapshot.
    expect(await row(w)).toEqual({
      computed_version: 0,
      computed_at: 0,
      snapshot_hash: null,
      snapshot_version: 0,
    })
    expect(await stored(w)).toEqual([])
    expect(await version(w)).toBe(before + 1)
    // The write's own job waits out the interval from the overtaken attempt, then computes.
    expect(await runStateJob(w.env, w.deps, w.userId)).toBe('deferred')
    w.h.clock.now += 30_000
    expect(await runStateJob(w.env, w.deps, w.userId)).toBe('written')
  })

  it('never puts an older snapshot over a newer one, and removes the object it wrote', async () => {
    const w = await prepared()
    let slow: string | undefined
    // While the first job is between its R2 write and its row, a write lands and a second job runs to the end.
    let fired = false
    const hooked = new Proxy(w.env.FILES!, {
      get(target, prop) {
        const value: unknown = Reflect.get(target, prop, target)
        if (prop !== 'put' || typeof value !== 'function') {
          return typeof value === 'function' ? value.bind(target) : value
        }
        return async (key: string, ...rest: unknown[]) => {
          const result: unknown = await Reflect.apply(value, target, [key, ...rest])
          if (!fired) {
            fired = true
            slow = key
            const extra = {
              ...digests[0]!,
              startMs: digests[0]!.startMs + 400 * 86_400_000,
              id: 'extra-2',
            }
            await seedDigests(w.env.DB, w.userId, [extra], 6_000)
            w.h.clock.now = extra.startMs + 7_200_000
            // Another isolate: the lock is this one's, so the second compute runs past it.
            const other = await computeAndStore(
              { ...w.env, FILES: target },
              w.deps,
              w.userId,
              (await jobRow(w.env.DB, w.userId))!,
              true,
            )
            expect(other.kind).toBe('written')
          }
          return result
        }
      },
    }) as R2Bucket
    expect(await runStateJob({ ...w.env, FILES: hooked }, w.deps, w.userId)).toBe('written')
    const final = await row(w)
    const keys = await stored(w)
    expect(keys).toEqual([`users/${w.userId}/state/${final!.snapshot_hash}.json.gz`])
    expect(keys).not.toContain(slow)
    expect(final!.snapshot_version).toBe(await version(w))
  })

  it('computes an account at the activity quota, and leaves a deleting or missing one alone', async () => {
    const w = await prepared()
    await w.env.DB.prepare('UPDATE users SET activity_count = ? WHERE id = ?')
      .bind(MAX_ACTIVITIES_PER_USER, w.userId)
      .run()
    expect(await runStateJob(w.env, w.deps, w.userId)).toBe('written')
    expect(await stored(w)).toHaveLength(1)
    await w.env.DB.prepare('UPDATE users SET deleting_at = 1 WHERE id = ?').bind(w.userId).run()
    expect(await runStateJob(w.env, w.deps, w.userId)).toBe('gone')
    expect(await runStateJob(w.env, w.deps, 'nobody')).toBe('gone')
  })

  it('takes the default settings for an account with no profile row, and skips a digest it cannot read', async () => {
    const w = await prepared()
    await w.env.DB.batch([
      w.env.DB.prepare('DELETE FROM profiles WHERE user_id = ?').bind(w.userId),
      w.env.DB.prepare(
        `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version, digest_json, file_name, file_hash, created_at)
         VALUES ('bad', ?, 'run-1', 'run', 1, 'x', 1, 'not json', 'f', ?, 1)`,
      ).bind(w.userId, 'c'.repeat(64)),
    ])
    expect(await runStateJob(w.env, w.deps, w.userId)).toBe('written')
  })

  it('refuses to run without file storage, so a retry is asked for', async () => {
    const w = await prepared()
    await expect(runStateJob({ ...w.env, FILES: undefined }, w.deps, w.userId)).rejects.toThrow(
      'no file storage',
    )
  })

  it('reads no digest when the R2 ledger would refuse the snapshot, so a retry costs no compute', async () => {
    const w = await prepared()
    await w.env.DB.prepare(
      `INSERT INTO r2_storage_budget (id, lifetime_put_bytes, monthly_period, monthly_operations,
         monthly_put_bytes, d1_size_bytes)
       VALUES (1, 1e15, '2000-01', 0, 0, 0)
       ON CONFLICT(id) DO UPDATE SET lifetime_put_bytes = excluded.lifetime_put_bytes`,
    ).run()
    const reads: string[] = []
    const env = {
      ...w.env,
      DB: racingDb(w.env.DB, /FROM activities/, async () => void reads.push('digests')),
    }
    await expect(runStateJob(env, w.deps, w.userId)).rejects.toThrow()
    expect(reads).toEqual([])
    expect(await stored(w)).toEqual([])
  })

  it('counts a compute that failed for coalescing, so the next message within the interval defers', async () => {
    const w = await prepared()
    await expect(
      runStateJob({ ...w.env, FILES: failingPuts(w.env.FILES!) }, w.deps, w.userId),
    ).rejects.toThrow('r2 down')
    w.h.clock.now += 29_000
    expect(await runStateJob(w.env, w.deps, w.userId)).toBe('deferred')
    w.h.clock.now += 1_000
    expect(await runStateJob(w.env, w.deps, w.userId)).toBe('written')
  })

  it('computes again a snapshot made under another analysis revision, and replaces it at the same library version', async () => {
    const w = await prepared()
    expect(await runStateJob(w.env, w.deps, w.userId)).toBe('written')
    const v = await version(w)
    // A deploy changed how a figure is worked out: the stored snapshot was made under the revision before.
    const stale = '0'.repeat(32)
    await w.env.DB.prepare(
      'UPDATE state_jobs SET analysis_revision = ?, snapshot_hash = ? WHERE user_id = ?',
    )
      .bind(RESULT_REVISION - 1, stale, w.userId)
      .run()
    w.h.clock.now += 60_000
    expect(await runStateJob(w.env, w.deps, w.userId)).toBe('written')
    const after = await w.env.DB.prepare(
      'SELECT snapshot_hash, snapshot_version, computed_version, analysis_revision FROM state_jobs WHERE user_id = ?',
    )
      .bind(w.userId)
      .first<{
        snapshot_hash: string
        snapshot_version: number
        computed_version: number
        analysis_revision: number
      }>()
    expect(after).toMatchObject({
      snapshot_version: v,
      computed_version: v,
      analysis_revision: RESULT_REVISION,
    })
    expect(after!.snapshot_hash).not.toBe(stale)
    expect(await runStateJob(w.env, w.deps, w.userId)).toBe('current')
  })
})
