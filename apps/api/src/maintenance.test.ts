import { DATABASE_SOFT_LIMIT_BYTES } from '@rca/contract'
import { describe, expect, it } from 'vitest'
import { systemDeps } from './deps.ts'
import {
  MAX_MAINTENANCE_OPERATIONS,
  ORPHAN_GRACE_MS,
  runMaintenance,
  type MaintenanceReport,
} from './maintenance.ts'
import { activityFileKey, userFilePrefix } from './storage.ts'
import {
  countingDb,
  createHarness,
  digestFixture,
  START,
  testEnv,
  type Harness,
} from './test/harness.ts'
import { sha256Hex } from './util.ts'

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
/** An hour past the orphan grace period for an object put at START. */
const AFTER_GRACE = START + ORPHAN_GRACE_MS + HOUR
const R2_CALLS = new Set(['list', 'delete', 'head', 'get', 'put'])

function at(now: number) {
  return { ...systemDeps, now: () => now }
}

async function signedInUser(h: Harness, email: string): Promise<{ token: string; uid: string }> {
  const token = await h.signIn(email)
  const me = (await (
    await h.send({ path: '/api/me', cookies: { rca_session: token } })
  ).json()) as {
    user: { id: string }
  }
  await h.send({
    method: 'PUT',
    path: '/api/profile',
    json: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: true },
    cookies: { rca_session: token },
  })
  return { token, uid: me.user.id }
}

async function addActivity(h: Harness, token: string, startMs: number): Promise<string> {
  const created = (await (
    await h.send({
      method: 'POST',
      path: '/api/activities',
      json: {
        digest: digestFixture({ startMs }),
        fileName: `ride-${startMs}.fit`,
        fileHash: await sha256Hex(new TextEncoder().encode(String(startMs))),
      },
      cookies: { rca_session: token },
    })
  ).json()) as { id: string }
  return created.id
}

async function countOf(sql: string, ...values: unknown[]): Promise<number> {
  const row = await testEnv()
    .DB.prepare(sql)
    .bind(...values)
    .first<{ n: number }>()
  return row?.n ?? 0
}

describe('scheduled maintenance', () => {
  it('deletes sessions that have expired or reached their 90-day end, and keeps live ones', async () => {
    const h = createHarness()
    const live = await h.signIn('live@example.com', 'Live')
    await h.env.DB.batch([
      h.env.DB.prepare(
        "INSERT INTO sessions (id, user_id, expires_at, created_at) SELECT 'expired', id, ?, ? FROM users WHERE email = 'live@example.com'",
      ).bind(START - 1, START),
      h.env.DB.prepare(
        "INSERT INTO sessions (id, user_id, expires_at, created_at) SELECT 'aged', id, ?, ? FROM users WHERE email = 'live@example.com'",
      ).bind(START + 30 * DAY, START - 91 * DAY),
    ])
    expect(await countOf('SELECT COUNT(*) AS n FROM sessions')).toBe(3)

    const report = await runMaintenance(h.env, at(START))

    expect(report.sessions).toBe(2)
    expect(await countOf('SELECT COUNT(*) AS n FROM sessions')).toBe(1)
    expect((await h.send({ path: '/api/me', cookies: { rca_session: live } })).status).toBe(200)
  })

  it('deletes expired upload slots and keeps unexpired ones', async () => {
    const h = createHarness()
    await h.signIn()
    await h.env.DB.batch([
      h.env.DB.prepare(
        'INSERT INTO upload_slots (user_id, slot_id, expires_at) SELECT id, ?, ? FROM users LIMIT 1',
      ).bind('old-slot', START - 1),
      h.env.DB.prepare(
        'INSERT INTO upload_slots (user_id, slot_id, expires_at) SELECT id, ?, ? FROM users LIMIT 1',
      ).bind('live-slot', START + HOUR),
    ])
    const report = await runMaintenance(h.env, at(START))
    expect(report.slots).toBe(1)
    expect(await countOf('SELECT COUNT(*) AS n FROM upload_slots')).toBe(1)
  })

  it('prunes daily budget rows from before the last seven UTC days and keeps the seventh day', async () => {
    const h = createHarness()
    await h.signIn()
    await h.env.DB.batch(
      ['2026-01-07', '2026-01-08', '2026-01-15'].map((day) =>
        h.env.DB.prepare(
          "INSERT INTO daily_budget (user_id, day, action, used) SELECT id, ?, 'read', 1 FROM users LIMIT 1",
        ).bind(day),
      ),
    )
    const report = await runMaintenance(h.env, at(START))
    expect(report.budgetRows).toBe(1)
    const days = await h.env.DB.prepare('SELECT day FROM daily_budget ORDER BY day').all<{
      day: string
    }>()
    expect(days.results.map((r) => r.day)).toEqual(['2026-01-08', '2026-01-15'])
  })

  it('sweeps R2 objects that have no matching row once they are older than the grace period', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const me = (await (
      await h.send({ path: '/api/me', cookies: { rca_session: token } })
    ).json()) as {
      user: { id: string }
    }
    const uid = me.user.id
    await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: true },
      cookies: { rca_session: token },
    })
    const content = new TextEncoder().encode('kept ride')
    const created = (await (
      await h.send({
        method: 'POST',
        path: '/api/activities',
        json: { digest: digestFixture(), fileName: 'k.fit', fileHash: await sha256Hex(content) },
        cookies: { rca_session: token },
      })
    ).json()) as { id: string }
    // The stored state an upload leaves behind, written directly so this test does not depend on
    // the upload route.
    const files = h.env.FILES!
    await h.env.DB.prepare('UPDATE activities SET file_key = ?, file_size = ? WHERE id = ?')
      .bind(activityFileKey(uid, created.id), content.byteLength, created.id)
      .run()
    await files.put(activityFileKey(uid, created.id), content)
    await files.put(`${userFilePrefix(uid)}ghost-activity`, 'no row')
    await files.put('users/deleted-user/whatever', 'owner is gone')
    await files.put('health/sentinel', 'owned by another check')
    await files.put('shared/report.csv', 'owned by another feature')

    const tooSoon = await runMaintenance(h.env, at(START))
    expect(tooSoon.orphansDeleted).toBe(0)
    expect(await files.get(`${userFilePrefix(uid)}ghost-activity`)).not.toBeNull()
    expect(await files.get('health/sentinel')).not.toBeNull()
    expect(await files.get('shared/report.csv')).not.toBeNull()

    const later = await runMaintenance(h.env, at(AFTER_GRACE))
    expect(later.orphansDeleted).toBe(2)
    expect(await files.get(`${userFilePrefix(uid)}ghost-activity`)).toBeNull()
    expect(await files.get('users/deleted-user/whatever')).toBeNull()
    expect(await files.get('health/sentinel')).not.toBeNull()
    expect(await files.get('shared/report.csv')).not.toBeNull()
    expect(await files.get(activityFileKey(uid, created.id))).not.toBeNull()
  })

  it('bounds orphan sweeping per run and resumes from the saved cursor on the next run', async () => {
    const h = createHarness()
    await h.signIn()
    const files = h.env.FILES!
    await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        files.put(`users/gone/${String(i).padStart(3, '0')}`, 'x'),
      ),
    )

    const first = await runMaintenance(h.env, at(AFTER_GRACE))
    expect(first.orphansDeleted).toBeLessThan(200)
    expect((await files.list({ prefix: 'users/gone/' })).objects.length).toBeGreaterThan(0)
    expect(
      await countOf(
        'SELECT COUNT(*) AS n FROM r2_storage_budget WHERE orphan_sweep_cursor IS NOT NULL',
      ),
    ).toBe(1)

    let runs = 1
    while ((await files.list({ prefix: 'users/gone/' })).objects.length > 0 && runs < 10) {
      await runMaintenance(h.env, at(AFTER_GRACE))
      runs += 1
    }
    expect((await files.list({ prefix: 'users/gone/' })).objects).toHaveLength(0)
    expect(
      await countOf(
        'SELECT COUNT(*) AS n FROM r2_storage_budget WHERE orphan_sweep_cursor IS NOT NULL',
      ),
    ).toBe(0)
  })

  it('keeps an object only when an activity row names that exact key as its file_key', async () => {
    const h = createHarness()
    const { token, uid } = await signedInUser(h, 'keys@example.com')
    const linked = await addActivity(h, token, START)
    const unlinked = await addActivity(h, token, START + HOUR)
    const wrongKey = await addActivity(h, token, START + 2 * HOUR)
    const linkedKey = activityFileKey(uid, linked)
    await h.env.DB.batch([
      h.env.DB.prepare('UPDATE activities SET file_key = ?, file_size = 1 WHERE id = ?').bind(
        linkedKey,
        linked,
      ),
      h.env.DB.prepare('UPDATE activities SET file_key = ?, file_size = 1 WHERE id = ?').bind(
        `users/${uid}/elsewhere`,
        wrongKey,
      ),
    ])
    const files = h.env.FILES!
    await files.put(linkedKey, 'linked')
    await files.put(activityFileKey(uid, unlinked), 'row has no file_key')
    await files.put(activityFileKey(uid, wrongKey), 'row names another key')

    const report = await runMaintenance(h.env, at(AFTER_GRACE))

    expect(report.orphansDeleted).toBe(2)
    expect(await files.get(linkedKey)).not.toBeNull()
    expect(await files.get(activityFileKey(uid, unlinked))).toBeNull()
    expect(await files.get(activityFileKey(uid, wrongKey))).toBeNull()
  })

  it('keeps an object while its owner holds an upload lease, and sweeps it once the lease ends', async () => {
    const h = createHarness()
    const { token, uid } = await signedInUser(h, 'lease@example.com')
    const inFlight = await addActivity(h, token, START)
    const key = activityFileKey(uid, inFlight)
    const files = h.env.FILES!
    await files.put(key, 'mid-upload')
    await h.env.DB.prepare(
      'INSERT INTO upload_slots (user_id, slot_id, expires_at) VALUES (?, ?, ?)',
    )
      .bind(uid, 'in-flight', AFTER_GRACE + 1)
      .run()

    expect((await runMaintenance(h.env, at(AFTER_GRACE))).orphansDeleted).toBe(0)
    expect(await files.get(key)).not.toBeNull()

    expect((await runMaintenance(h.env, at(AFTER_GRACE + 2))).orphansDeleted).toBe(1)
    expect(await files.get(key)).toBeNull()
  })

  // Seeding 2,202 objects through Miniflare takes over half of this test, and on a loaded machine
  // the whole test can pass the 30 s default.
  it('never issues more than MAX_MAINTENANCE_OPERATIONS D1 statements and R2 calls in a run, and finishes a worst-case backlog over later runs', async ({
    signal,
  }) => {
    const setup = createHarness()
    const files = setup.env.FILES!
    const uids: string[] = []
    for (const email of ['first@example.com', 'second@example.com']) {
      const { token, uid } = await signedInUser(setup, email)
      const activity = await addActivity(setup, token, START)
      await setup.env.DB.prepare('UPDATE activities SET file_key = ?, file_size = 1 WHERE id = ?')
        .bind(activityFileKey(uid, activity), activity)
        .run()
      await files.put(activityFileKey(uid, activity), 'original')
      uids.push(uid)
    }
    // Over one R2 list page per account, so each deletion's sweep needs two list calls.
    for (const uid of uids) {
      await Promise.all(
        Array.from({ length: 1001 }, (_, i) => files.put(`${userFilePrefix(uid)}x${i}`, 'x')),
      )
    }
    for (const uid of uids) {
      await setup.env.DB.batch([
        setup.env.DB.prepare('UPDATE users SET deleting_at = ? WHERE id = ?').bind(START, uid),
        setup.env.DB.prepare(
          'INSERT INTO pending_account_deletions (user_id, requested_at, sweep_pending) VALUES (?, ?, 1)',
        ).bind(uid, START),
      ])
    }
    await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        files.put(`users/gone/${String(i).padStart(3, '0')}`, 'x'),
      ),
    )

    const counted = countingDb(testEnv().DB)
    let r2Calls = 0
    const countedFiles = new Proxy(files, {
      get(target, property) {
        const value: unknown = Reflect.get(target, property, target)
        if (typeof value !== 'function') return value
        return (...args: unknown[]) => {
          if (typeof property === 'string' && R2_CALLS.has(property)) r2Calls += 1
          return Reflect.apply(value, target, args)
        }
      },
    })
    const env = testEnv({ DB: counted.db, FILES: countedFiles })

    const reports: MaintenanceReport[] = []
    for (let run = 0; run < 10; run += 1) {
      // Vitest moves on from a timed-out test without stopping it. This stops the runs after the
      // one in flight from writing into the bindings the next test has just reset.
      signal.throwIfAborted()
      counted.reset()
      r2Calls = 0
      const report = await runMaintenance(env, at(AFTER_GRACE))
      reports.push(report)
      expect(report.operations).toBeLessThanOrEqual(MAX_MAINTENANCE_OPERATIONS)
      expect(counted.count() + r2Calls).toBeLessThanOrEqual(MAX_MAINTENANCE_OPERATIONS)
    }

    expect(reports[0]?.budgetReached).toBe(true)
    expect(reports.reduce((sum, r) => sum + r.finishedDeletions, 0)).toBe(2)
    expect(await countOf('SELECT COUNT(*) AS n FROM pending_account_deletions')).toBe(0)
    expect((await files.list({ prefix: 'users/gone/' })).objects).toHaveLength(0)
  }, 120_000)

  it('finishes interrupted account deletions that were recorded before the process stopped', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const me = (await (
      await h.send({ path: '/api/me', cookies: { rca_session: token } })
    ).json()) as {
      user: { id: string }
    }
    await h.env.DB.prepare('UPDATE users SET deleting_at = ? WHERE id = ?')
      .bind(START, me.user.id)
      .run()
    await h.env.DB.prepare(
      'INSERT INTO pending_account_deletions (user_id, requested_at, sweep_pending) VALUES (?, ?, 0)',
    )
      .bind(me.user.id, START)
      .run()
    const report = await runMaintenance(h.env, at(START))
    expect(report.finishedDeletions).toBe(1)
    expect(await countOf('SELECT COUNT(*) AS n FROM users')).toBe(0)
  })

  it('refreshes the recorded database size, so a stale over-limit value cannot block creates', async () => {
    const h = createHarness()
    await h.signIn()
    await h.env.DB.prepare(
      `INSERT INTO r2_storage_budget (id, lifetime_put_bytes, monthly_period, monthly_operations,
         monthly_put_bytes, d1_size_bytes) VALUES (1, 0, '2026-01', 0, 0, ?)
       ON CONFLICT(id) DO UPDATE SET d1_size_bytes = excluded.d1_size_bytes`,
    )
      .bind(DATABASE_SOFT_LIMIT_BYTES + 1)
      .run()
    await runMaintenance(h.env, at(START))
    const size = await countOf('SELECT d1_size_bytes AS n FROM r2_storage_budget WHERE id = 1')
    expect(size).toBeGreaterThan(0)
    expect(size).toBeLessThanOrEqual(DATABASE_SOFT_LIMIT_BYTES)
  })

  it('skips R2 entirely when no bucket is bound, without failing the other tasks', async () => {
    const h = createHarness({}, { FILES: undefined })
    await h.signIn()
    const report = await runMaintenance(h.env, at(START))
    expect(report.orphansDeleted).toBe(0)
  })

  it('exports a scheduled handler on the Worker entry point', async () => {
    const worker = (await import('./index.ts')).default
    expect(typeof worker.scheduled).toBe('function')
    expect(typeof worker.fetch).toBe('function')
  })
})
