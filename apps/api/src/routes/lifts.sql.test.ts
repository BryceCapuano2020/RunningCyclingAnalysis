import { MAX_LIFT_SETS_PER_USER } from '@rca/core/lift'
import { describe, expect, it } from 'vitest'
import { countingDb, testEnv } from '../test/harness.ts'
import { keyOf, liftAccount, liftSet } from '../test/lifts.ts'
import { DELETE_SETS, identitiesJson } from './liftSql.ts'

const touchesLifts = (sql: string) =>
  /^(UPDATE users SET lift_count|INSERT INTO lift_sets|DELETE FROM lift_sets)/.test(sql)

async function counts(uid: string) {
  const db = testEnv().DB
  const user = await db
    .prepare('SELECT lift_count, lift_revision FROM users WHERE id = ?')
    .bind(uid)
    .first<{ lift_count: number; lift_revision: number }>()
  const rows = await db
    .prepare('SELECT COUNT(*) AS n FROM lift_sets WHERE user_id = ?')
    .bind(uid)
    .first<{ n: number }>()
  return { stored: user?.lift_count, rows: rows?.n }
}

describe('what a lift write costs', () => {
  it.each([
    ['a write of one set', 1, false],
    ['a write of 500 sets', 500, false],
    ['an insert-only write of 500 sets', 500, true],
    ['a delete of 500 keys', 500, 'delete'],
  ] as const)('runs two statements for %s', async (_label, size, mode) => {
    const counted = countingDb(testEnv().DB)
    const { put, del, me } = await liftAccount(undefined, { DB: counted.db })
    const sets = Array.from({ length: size }, (_, i) =>
      liftSet((i % 200) + 1, { exercise: `lift-${Math.floor(i / 200)}` }),
    )
    const uid = (await me()).user.id
    counted.reset()
    const res = mode === 'delete' ? await del(sets.map(keyOf)) : await put(sets, mode || undefined)
    expect(res.status).toBe(200)
    const statements = counted.statements().filter(touchesLifts)
    expect(statements).toHaveLength(2)
    expect(statements[0]).toMatch(/^UPDATE users SET lift_count/)
    expect(statements.every((sql) => sql.includes('json_each'))).toBe(true)
    expect(await counts(uid)).toEqual({
      stored: mode === 'delete' ? 0 : size,
      rows: mode === 'delete' ? 0 : size,
    })
  })

  it('searches the primary key for each deleted key, not the account', async () => {
    const db = testEnv().DB
    const plan = await db
      .prepare(`EXPLAIN QUERY PLAN ${DELETE_SETS}`)
      .bind(
        'u1',
        identitiesJson([
          { date: '2026-03-02', exercise: 'back-squat', equipment: 'barbell', setOrder: 1 },
        ]),
      )
      .all<{ detail: string }>()
    const details = plan.results.map((row) => row.detail)
    expect(
      details.some((d) =>
        /SEARCH lift_sets USING (COVERING )?INDEX sqlite_autoindex_lift_sets_1/.test(d),
      ),
    ).toBe(true)
    expect(details.filter((d) => /SCAN lift_sets/.test(d))).toEqual([])
  })
})

describe('the count against the rows', () => {
  it('stays equal through inserts, replaces, insert-onlys and deletes', async () => {
    const { put, del, me } = await liftAccount()
    const uid = (await me()).user.id
    const a = [liftSet(1), liftSet(2), liftSet(3)]
    await put(a)
    expect(await counts(uid)).toEqual({ stored: 3, rows: 3 })
    await put([liftSet(2, { reps: 9 }), liftSet(4)])
    expect(await counts(uid)).toEqual({ stored: 4, rows: 4 })
    await put([liftSet(1), liftSet(5)], true)
    expect(await counts(uid)).toEqual({ stored: 5, rows: 5 })
    await del([keyOf(liftSet(1)), keyOf(liftSet(99))])
    expect(await counts(uid)).toEqual({ stored: 4, rows: 4 })
    await del([keyOf(liftSet(1))])
    await del([keyOf(liftSet(2)), keyOf(liftSet(3)), keyOf(liftSet(4)), keyOf(liftSet(5))])
    expect(await counts(uid)).toEqual({ stored: 0, rows: 0 })
  })

  it('keeps one account count apart from the other', async () => {
    const one = await liftAccount('one@example.com')
    const two = await liftAccount('two@example.com')
    await one.put([liftSet(1), liftSet(2)])
    await two.put([liftSet(1)])
    expect(await counts((await one.me()).user.id)).toEqual({ stored: 2, rows: 2 })
    expect(await counts((await two.me()).user.id)).toEqual({ stored: 1, rows: 1 })
  })
})

describe('the cap', () => {
  async function fillTo(uid: string, total: number) {
    // Seeds rows and the count directly: 60,000 sets through the API would be 120 requests.
    const db = testEnv().DB
    await db
      .prepare(
        `INSERT INTO lift_sets (user_id, date, exercise, equipment, set_order, reps, load_kg, updated_at)
         WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?2)
         SELECT ?1, '2026-01-01', 'seed-' || (i / 200), 'barbell', (i % 200) + 1, 5, 50, 0 FROM n`,
      )
      .bind(uid, total)
      .run()
    await db.prepare('UPDATE users SET lift_count = ? WHERE id = ?').bind(total, uid).run()
  }

  it('answers 409 past the cap, rolls the whole batch back and refunds the unit', async () => {
    const { put, me } = await liftAccount()
    const uid = (await me()).user.id
    await fillTo(uid, MAX_LIFT_SETS_PER_USER - 1)
    const res = await put([liftSet(1), liftSet(2)])
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: { code: 'lift_limit' } })
    expect(await counts(uid)).toEqual({
      stored: MAX_LIFT_SETS_PER_USER - 1,
      rows: MAX_LIFT_SETS_PER_USER - 1,
    })
    const user = await testEnv()
      .DB.prepare('SELECT lift_revision FROM users WHERE id = ?')
      .bind(uid)
      .first<{ lift_revision: number }>()
    expect(user?.lift_revision).toBe(0)
    const budget = await testEnv()
      .DB.prepare("SELECT used FROM daily_budget WHERE action = 'liftWrite'")
      .first<{ used: number }>()
    expect(budget?.used).toBe(0)
  }, 20_000)

  it('still takes replaces and the last place at the cap', async () => {
    const { put, me } = await liftAccount()
    const uid = (await me()).user.id
    await fillTo(uid, MAX_LIFT_SETS_PER_USER - 1)
    expect(
      (await put([liftSet(2, { exercise: 'seed-0', date: '2026-01-01', reps: 7 })])).status,
    ).toBe(200)
    expect((await put([liftSet(1)])).status).toBe(200)
    expect((await put([liftSet(2)])).status).toBe(409)
    expect(await counts(uid)).toEqual({
      stored: MAX_LIFT_SETS_PER_USER,
      rows: MAX_LIFT_SETS_PER_USER,
    })
  }, 30_000)
})

describe('account deletion', () => {
  it('leaves no lift_sets row', async () => {
    const mine = await liftAccount('mine@example.com')
    const other = await liftAccount('other@example.com')
    await mine.put([liftSet(1), liftSet(2)])
    await other.put([liftSet(1)])
    const res = await mine.h.send({ method: 'DELETE', path: '/api/me', cookies: mine.cookies })
    expect(res.status).toBe(204)
    const rows = await testEnv()
      .DB.prepare('SELECT user_id FROM lift_sets')
      .all<{ user_id: string }>()
    expect(rows.results).toHaveLength(1)
    expect(rows.results[0]?.user_id).toBe((await other.me()).user.id)
  })
})
