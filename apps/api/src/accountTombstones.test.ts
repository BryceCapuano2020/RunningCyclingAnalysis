import { describe, expect, it } from 'vitest'
import { createHarness, START } from './test/harness.ts'
import { systemDeps } from './deps.ts'
import { runMaintenance } from './maintenance.ts'
import { TOMBSTONE_RETENTION_DAYS } from './accountDeletion.ts'

const DAY_MS = 24 * 60 * 60 * 1000

async function userIdOf(h: ReturnType<typeof createHarness>, token: string): Promise<string> {
  const res = await h.send({ path: '/api/me', cookies: { rca_session: token } })
  return ((await res.json()) as { user: { id: string } }).user.id
}

async function tombstones(h: ReturnType<typeof createHarness>) {
  const rows = await h.env.DB.prepare(
    'SELECT * FROM account_tombstones ORDER BY deleted_at, user_id',
  ).all<Record<string, unknown>>()
  return rows.results
}

describe('account tombstones', () => {
  it('records the deleted account id and time, and nothing else, for that account only', async () => {
    const h = createHarness()
    const alice = await h.signIn('alice@example.com', 'Alice')
    const bob = await h.signIn('bob@example.com', 'Bob')
    const aliceId = await userIdOf(h, alice)
    expect(await tombstones(h)).toEqual([])

    const res = await h.send({ method: 'DELETE', path: '/api/me', cookies: { rca_session: alice } })
    expect(res.status).toBe(204)

    const rows = await tombstones(h)
    expect(rows).toHaveLength(1)
    expect(Object.keys(rows[0]!).sort()).toEqual(['deleted_at', 'user_id'])
    expect(rows[0]!.user_id).toBe(aliceId)
    expect(typeof rows[0]!.deleted_at).toBe('number')
    expect((await h.send({ path: '/api/me', cookies: { rca_session: bob } })).status).toBe(200)
  })

  it('is written when the account has no Google identity too', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await userIdOf(h, token)
    await h.env.DB.prepare('DELETE FROM oauth_accounts WHERE user_id = ?').bind(id).run()
    const res = await h.send({ method: 'DELETE', path: '/api/me', cookies: { rca_session: token } })
    expect(res.status).toBe(204)
    expect((await tombstones(h)).map((row) => row.user_id)).toEqual([id])
  })

  it('keeps one row when a finished deletion is run again', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await userIdOf(h, token)
    await h.send({ method: 'DELETE', path: '/api/me', cookies: { rca_session: token } })
    await h.env.DB.prepare('INSERT OR IGNORE INTO account_tombstones VALUES (?, ?)')
      .bind(id, START + 1)
      .run()
    expect(await tombstones(h)).toHaveLength(1)
  })

  it('is removed by the daily cleanup only after the retention period', async () => {
    const h = createHarness()
    const insert = h.env.DB.prepare('INSERT INTO account_tombstones VALUES (?, ?)')
    await h.env.DB.batch([insert.bind('old', START - 1), insert.bind('recent', START + 1)])
    const now = START + TOMBSTONE_RETENTION_DAYS * DAY_MS
    const report = await runMaintenance(h.env, { ...systemDeps, now: () => now })
    expect((await tombstones(h)).map((row) => row.user_id)).toEqual(['recent'])
    expect(report.budgetRows).toBeGreaterThanOrEqual(1)

    await runMaintenance(h.env, { ...systemDeps, now: () => now + 2 * DAY_MS })
    expect(await tombstones(h)).toEqual([])
  })
})
