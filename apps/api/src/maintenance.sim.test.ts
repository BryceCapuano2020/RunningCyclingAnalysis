import { describe, expect, it } from 'vitest'
import {
  MAX_MAINTENANCE_OPERATIONS,
  runMaintenance,
  type MaintenanceReport,
} from './maintenance.ts'
import { activityFileKey, userFilePrefix } from './storage.ts'
import { countingDb, createHarness, START, testEnv } from './test/harness.ts'
import {
  addActivity,
  AFTER_GRACE,
  at,
  countOf,
  R2_CALLS,
  signedInUser,
} from './test/maintenance.ts'

describe('scheduled maintenance, worst case', () => {
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
    // A deletion whose user row is gone but whose pending row the cap kept from being cleared is
    // finished, and counted, again by the next run. So the count is at least the two accounts.
    const finishedTotal = reports.reduce((sum, r) => sum + r.finishedDeletions, 0)
    expect(finishedTotal).toBeGreaterThanOrEqual(2)
    expect(finishedTotal).toBeLessThanOrEqual(2 * reports.length)
    expect(await countOf('SELECT COUNT(*) AS n FROM users')).toBe(0)
    expect(await countOf('SELECT COUNT(*) AS n FROM pending_account_deletions')).toBe(0)
    expect(await countOf('SELECT COUNT(*) AS n FROM account_tombstones')).toBe(2)
    expect((await files.list({ prefix: 'users/gone/' })).objects).toHaveLength(0)
  }, 120_000)
})
