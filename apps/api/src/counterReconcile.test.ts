import { afterEach, describe, expect, it, vi } from 'vitest'
import { RECONCILE_USERS_PER_RUN, reconcileCounters } from './counterReconcile.ts'
import { runMaintenance } from './maintenance.ts'
import { createHarness, START } from './test/harness.ts'
import { addActivity, at, signedInUser } from './test/maintenance.ts'

afterEach(() => vi.restoreAllMocks())

async function counters(h: ReturnType<typeof createHarness>) {
  const row = await h.env.DB.prepare(
    'SELECT group_concat(activity_count || "," || digest_bytes || "," || file_bytes || "," || library_version, ";") AS s FROM users',
  ).first<{ s: string }>()
  return row?.s
}

describe('reconcileCounters', () => {
  it('reports nothing for accounts whose counters match their rows', async () => {
    const h = createHarness()
    const user = await signedInUser(h, 'a@example.com')
    await addActivity(h, user.token, START)
    const warn = vi.spyOn(console, 'warn')
    expect(await reconcileCounters(h.env, START)).toEqual({ checked: 1, drifted: 0 })
    expect(warn).not.toHaveBeenCalled()
  })

  it('logs the account id and the drifted counters, never their values, and changes nothing', async () => {
    const h = createHarness()
    const user = await signedInUser(h, 'a@example.com')
    const other = await signedInUser(h, 'b@example.com')
    await addActivity(h, user.token, START)
    await addActivity(h, other.token, START + 1000)
    await h.env.DB.prepare('UPDATE users SET activity_count = 7, file_bytes = 99 WHERE id = ?')
      .bind(user.uid)
      .run()
    await h.env.DB.prepare(
      'INSERT INTO state_jobs (user_id, computed_version) VALUES (?, 1000000) ON CONFLICT(user_id) DO UPDATE SET computed_version = 1000000',
    )
      .bind(other.uid)
      .run()
    const before = await counters(h)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(await reconcileCounters(h.env, START)).toEqual({ checked: 2, drifted: 2 })

    const lines = warn.mock.calls.map(([line]) => JSON.parse(String(line)))
    expect(lines).toContainEqual({
      event: 'counter_drift',
      userId: user.uid,
      counters: ['activity_count', 'file_bytes'],
    })
    expect(lines).toContainEqual({
      event: 'counter_drift',
      userId: other.uid,
      counters: ['library_version'],
    })
    expect(JSON.stringify(lines)).not.toMatch(/\b99\b|1000000/)
    expect(await counters(h)).toBe(before)
  })

  it('skips accounts being deleted', async () => {
    const h = createHarness()
    const user = await signedInUser(h, 'a@example.com')
    await h.env.DB.prepare('UPDATE users SET activity_count = 7, deleting_at = ? WHERE id = ?')
      .bind(START, user.uid)
      .run()
    expect(await reconcileCounters(h.env, START)).toEqual({ checked: 0, drifted: 0 })
  })

  it('reads one page of accounts a run and moves to the next page the next day', async () => {
    const h = createHarness()
    const total = RECONCILE_USERS_PER_RUN + 3
    await h.env.DB.batch(
      Array.from({ length: total }, (_, i) =>
        h.env.DB.prepare(
          'INSERT INTO users (id, email, name, created_at, activity_count) VALUES (?, ?, ?, ?, 5)',
        ).bind(`u${String(i).padStart(3, '0')}`, `u${i}@example.com`, `User ${i}`, START),
      ),
    )
    const first = await reconcileCounters(h.env, START)
    const second = await reconcileCounters(h.env, START + 24 * 60 * 60 * 1000)
    expect([first.checked, second.checked].sort((a, b) => a - b)).toEqual([
      3,
      RECONCILE_USERS_PER_RUN,
    ])
  })

  it('runs in the daily pass and appears in its report', async () => {
    const h = createHarness()
    const user = await signedInUser(h, 'a@example.com')
    await h.env.DB.prepare('UPDATE users SET digest_bytes = 3 WHERE id = ?').bind(user.uid).run()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const report = await runMaintenance(h.env, at(START))
    expect(report).toMatchObject({ countersChecked: 1, countersDrifted: 1 })
  })
})
