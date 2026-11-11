import { afterEach, describe, expect, it, vi } from 'vitest'
import { OperationBudgetExhausted } from './maintenanceGuard.ts'
import { RECONCILE_USERS_PER_RUN, reconcileCounters } from './counterReconcile.ts'
import { runMaintenance } from './maintenance.ts'
import { createHarness, START } from './test/harness.ts'
import { stateWorld } from './test/stateKit.ts'
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

  it('counts pages without the accounts being deleted, so no day reads an empty page', async () => {
    const h = createHarness()
    const total = RECONCILE_USERS_PER_RUN * 2
    await h.env.DB.batch(
      Array.from({ length: total }, (_, i) =>
        h.env.DB.prepare(
          'INSERT INTO users (id, email, name, created_at, deleting_at) VALUES (?, ?, ?, ?, ?)',
        ).bind(
          `u${String(i).padStart(3, '0')}`,
          `u${i}@example.com`,
          `User ${i}`,
          START,
          i < RECONCILE_USERS_PER_RUN ? null : START,
        ),
      ),
    )
    for (let day = 0; day < 3; day += 1) {
      const report = await reconcileCounters(h.env, START)
      expect(report.checked).toBe(RECONCILE_USERS_PER_RUN)
    }
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
    const second = await reconcileCounters(h.env, START)
    expect([first.checked, second.checked].sort((a, b) => a - b)).toEqual([
      3,
      RECONCILE_USERS_PER_RUN,
    ])
  })

  it('covers every account within ceil(n / page) runs whatever is added or deleted between them', async () => {
    const h = createHarness()
    const id = (i: number) => `u${String(i).padStart(3, '0')}`
    const insert = (i: number) =>
      h.env.DB.prepare(
        'INSERT INTO users (id, email, name, created_at, activity_count) VALUES (?, ?, ?, ?, 5)',
      ).bind(id(i), `u${i}@example.com`, `User ${i}`, START)
    // Every account drifts (a count of 5 and no rows), so each one checked is named in a log line.
    await h.env.DB.batch(Array.from({ length: 12 }, (_, i) => insert(i * 2 + 1)))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const seen = new Set<string>()
    const run = async () => {
      warn.mockClear()
      await reconcileCounters(h.env, START)
      for (const [line] of warn.mock.calls) seen.add(JSON.parse(String(line)).userId)
    }
    const runs = Math.ceil(12 / RECONCILE_USERS_PER_RUN)
    await run()
    // Between runs: accounts arrive in front of the cursor (which an offset would read twice, pushing the rest back) and
    // accounts that were checked already are deleted (which an offset would let skip the ones behind).
    await h.env.DB.batch([insert(0), insert(2), insert(4)])
    await h.env.DB.prepare('DELETE FROM users WHERE id IN (?, ?)').bind(id(1), id(3)).run()
    for (let i = 1; i < runs; i += 1) await run()
    const waiting = Array.from({ length: 12 }, (_, i) => id(i * 2 + 1)).filter(
      (user) => user !== id(1) && user !== id(3),
    )
    for (const user of waiting) expect(seen, user).toContain(user)
  })

  it('starts again from the first account once the last has been read, with no empty run between', async () => {
    const h = createHarness()
    const total = RECONCILE_USERS_PER_RUN * 2
    await h.env.DB.batch(
      Array.from({ length: total }, (_, i) =>
        h.env.DB.prepare(
          'INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)',
        ).bind(`u${String(i).padStart(3, '0')}`, `u${i}@example.com`, `User ${i}`, START),
      ),
    )
    const checked = []
    for (let i = 0; i < 4; i += 1) checked.push((await reconcileCounters(h.env, START)).checked)
    expect(checked).toEqual(Array(4).fill(RECONCILE_USERS_PER_RUN))
  })

  it('logs counter_reconcile_skipped when the operation budget stops it, and returns nothing checked', async () => {
    const h = createHarness()
    await signedInUser(h, 'a@example.com')
    const spent = new Proxy(h.env.DB, {
      get(target, property) {
        if (property === 'prepare') {
          return () => {
            throw new OperationBudgetExhausted()
          }
        }
        const value: unknown = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await reconcileCounters({ ...h.env, DB: spent }, START)).toEqual({
      checked: 0,
      drifted: 0,
    })
    expect(warn.mock.calls.map(([line]) => JSON.parse(String(line)))).toEqual([
      { event: 'counter_reconcile_skipped' },
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

  it('fails alone in the daily pass: the re-send still runs and the log names only the error class', async () => {
    const w = await stateWorld()
    const failing = new Proxy(w.env.DB, {
      get(target, property) {
        if (property === 'prepare') {
          return (query: string) => {
            if (query.includes('page AS')) throw new TypeError(`no such table: ${w.userId}`)
            return target.prepare(query)
          }
        }
        const value: unknown = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const report = await runMaintenance({ ...w.env, DB: failing }, w.deps)
    expect(report).toMatchObject({ stateResent: 1, countersChecked: 0, countersDrifted: 0 })
    expect(w.sent).toHaveLength(1)
    expect(error.mock.calls.map(([line]) => JSON.parse(String(line)))).toEqual([
      { event: 'counter_reconcile_failed', errorClass: 'TypeError' },
    ])
  })
})
