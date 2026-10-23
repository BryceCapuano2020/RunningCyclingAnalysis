import { describe, expect, it } from 'vitest'
import { systemDeps } from './deps.ts'
import { ORPHAN_GRACE_MS, runMaintenance } from './maintenance.ts'
import { activityFileKey, userFilePrefix } from './storage.ts'
import { createHarness, digestFixture, START, testEnv } from './test/harness.ts'
import { sha256Hex } from './util.ts'

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

function at(now: number) {
  return { ...systemDeps, now: () => now }
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
    await h.send({
      method: 'PUT',
      path: `/api/activities/${created.id}/file`,
      raw: content,
      cookies: { rca_session: token },
    })
    const files = testEnv().FILES!
    await files.put(`${userFilePrefix(uid)}ghost-activity`, 'no row')
    await files.put('users/deleted-user/whatever', 'owner is gone')
    await files.put('health/sentinel', 'owned by another check')
    await files.put('shared/report.csv', 'owned by another feature')

    const tooSoon = await runMaintenance(h.env, at(Date.now()))
    expect(tooSoon.orphansDeleted).toBe(0)
    expect(await files.get(`${userFilePrefix(uid)}ghost-activity`)).not.toBeNull()
    expect(await files.get('health/sentinel')).not.toBeNull()
    expect(await files.get('shared/report.csv')).not.toBeNull()

    const later = await runMaintenance(h.env, at(Date.now() + ORPHAN_GRACE_MS + HOUR))
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
    const files = testEnv().FILES!
    await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        files.put(`users/gone/${String(i).padStart(3, '0')}`, 'x'),
      ),
    )
    const later = Date.now() + ORPHAN_GRACE_MS + HOUR

    const first = await runMaintenance(h.env, at(later))
    expect(first.orphansDeleted).toBeLessThan(200)
    expect((await files.list({ prefix: 'users/gone/' })).objects.length).toBeGreaterThan(0)
    expect(
      await countOf(
        'SELECT COUNT(*) AS n FROM r2_storage_budget WHERE orphan_sweep_cursor IS NOT NULL',
      ),
    ).toBe(1)

    let runs = 1
    while ((await files.list({ prefix: 'users/gone/' })).objects.length > 0 && runs < 10) {
      await runMaintenance(h.env, at(later))
      runs += 1
    }
    expect((await files.list({ prefix: 'users/gone/' })).objects).toHaveLength(0)
    expect(
      await countOf(
        'SELECT COUNT(*) AS n FROM r2_storage_budget WHERE orphan_sweep_cursor IS NOT NULL',
      ),
    ).toBe(0)
  })

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
