import { describe, expect, it } from 'vitest'
import {
  DATABASE_SOFT_LIMIT_BYTES,
  DAILY_LIMITS,
  MAX_ACTIVITIES_PER_USER,
  MAX_DIGEST_BYTES_PER_USER,
} from '@rca/contract'
import { utcDay } from '../budget.ts'
import {
  countingDb,
  createHarness,
  digestFixture,
  START,
  testEnv,
  type Harness,
} from '../test/harness.ts'
import { racingDb } from '../test/racingDb.ts'
import { sha256Hex } from '../util.ts'

const HASH = await sha256Hex(new TextEncoder().encode('0123 fake FIT bytes'))

/** Names the statements a create is expected to run, and leaves any other statement as its SQL. */
const LABELS: [RegExp, string][] = [
  [/^select "sessions"/i, 'read the session'],
  [/^select .* from "activities"/i, 'read the activity'],
  [/^SELECT deleting_at/, 'read the account'],
  [/^INSERT INTO daily_budget/, 'charge the day'],
  [/^INSERT INTO activities/, 'insert the activity'],
  [/^UPDATE users SET activity_count/, 'move the counters'],
  [/^INSERT INTO r2_storage_budget/, 'record the database size'],
]

function labelled(statements: string[]): string[] {
  return statements.map((sql) => LABELS.find(([pattern]) => pattern.test(sql))?.[1] ?? sql)
}

const WRITE = /^(INSERT|UPDATE|DELETE)\b/i

function post(h: Harness, token: string, digest: Record<string, unknown> = {}): Promise<Response> {
  return h.send({
    method: 'POST',
    path: '/api/activities',
    json: { digest: digestFixture(digest), fileName: 'ride.fit', fileHash: HASH },
    cookies: { rca_session: token },
  })
}

async function userId(h: Harness, token: string): Promise<string> {
  const me = (await (
    await h.send({ path: '/api/me', cookies: { rca_session: token } })
  ).json()) as {
    user: { id: string }
  }
  return me.user.id
}

async function count(h: Harness, sql: string, ...binds: unknown[]): Promise<number> {
  const row = await h.env.DB.prepare(sql)
    .bind(...binds)
    .first<{ n: number }>()
  return row?.n ?? 0
}

const dailyUsed = (h: Harness, uid: string) =>
  count(
    h,
    `SELECT coalesce(sum(used), 0) AS n FROM daily_budget WHERE user_id = ? AND action = 'activityCreate'`,
    uid,
  )

const activityRows = (h: Harness) => count(h, 'SELECT COUNT(*) AS n FROM activities')

describe('what a new create costs', () => {
  it('answers from the row it inserted, with no read of the activity afterwards', async () => {
    const counted = countingDb(testEnv().DB)
    const h = createHarness({}, { DB: counted.db })
    const token = await h.signIn()
    counted.reset()

    const res = await post(h, token)

    expect(res.status).toBe(201)
    expect(labelled(counted.statements())).toEqual([
      'read the session',
      'read the activity',
      'read the account',
      'charge the day',
      'insert the activity',
      'move the counters',
      'record the database size',
    ])
    const insert = counted.statements().find((sql) => sql.startsWith('INSERT INTO activities'))
    expect(insert).toMatch(/\bRETURNING\b/)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      digest: { name: 'Morning ride' },
      fileName: 'ride.fit',
      hasFile: false,
      fileSize: null,
      createdAt: START,
    })
    expect(await activityRows(h)).toBe(1)
  })

  it('returns the same record from the insert as the library lists afterwards', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const created = (await (await post(h, token)).json()) as { id: string }
    const listed = (await (
      await h.send({ path: '/api/activities', cookies: { rca_session: token } })
    ).json()) as { items: unknown[] }
    expect(listed.items).toEqual([created])
  })
})

describe('a create that the account cannot hold', () => {
  async function refusedCreate(
    prepare: (h: Harness, uid: string) => Promise<void>,
  ): Promise<{ res: Response; writes: string[]; h: Harness; uid: string }> {
    const counted = countingDb(testEnv().DB)
    const h = createHarness({}, { DB: counted.db })
    const token = await h.signIn()
    const uid = await userId(h, token)
    await prepare(h, uid)
    counted.reset()
    const res = await post(h, token)
    return { res, writes: counted.statements().filter((sql) => WRITE.test(sql)), h, uid }
  }

  const cases: [string, number, string, (h: Harness, uid: string) => Promise<void>][] = [
    [
      'is past the activity limit',
      403,
      'activity_quota',
      async (h, uid) => {
        await h.env.DB.prepare('UPDATE users SET activity_count = ? WHERE id = ?')
          .bind(MAX_ACTIVITIES_PER_USER, uid)
          .run()
      },
    ],
    [
      'would pass the digest limit',
      403,
      'digest_quota',
      async (h, uid) => {
        await h.env.DB.prepare('UPDATE users SET digest_bytes = ? WHERE id = ?')
          .bind(MAX_DIGEST_BYTES_PER_USER, uid)
          .run()
      },
    ],
    [
      'finds the database over its limit',
      503,
      'database_full',
      async (h) => {
        await h.env.DB.prepare(
          `INSERT INTO r2_storage_budget (id, lifetime_put_bytes, monthly_period,
             monthly_operations, monthly_put_bytes, d1_size_bytes)
           VALUES (1, 0, '2026-01', 0, 0, ?)
           ON CONFLICT(id) DO UPDATE SET d1_size_bytes = excluded.d1_size_bytes`,
        )
          .bind(DATABASE_SOFT_LIMIT_BYTES + 1)
          .run()
      },
    ],
  ]

  for (const [name, status, code, prepare] of cases) {
    it(`writes nothing when the account ${name}`, async () => {
      const { res, writes, h, uid } = await refusedCreate(prepare)
      expect(res.status).toBe(status)
      expect(await res.json()).toMatchObject({ error: { code } })
      expect(writes).toEqual([])
      expect(await dailyUsed(h, uid)).toBe(0)
      expect(await activityRows(h)).toBe(0)
    })
  }

  it('names the full library before the spent day, and spends nothing on either', async () => {
    const { res, writes, h, uid } = await refusedCreate(async (h, uid) => {
      await h.env.DB.prepare('UPDATE users SET activity_count = ? WHERE id = ?')
        .bind(MAX_ACTIVITIES_PER_USER, uid)
        .run()
      await h.env.DB.prepare(
        `INSERT INTO daily_budget (user_id, day, action, used) VALUES (?, ?, 'activityCreate', ?)`,
      )
        .bind(uid, utcDay(START), DAILY_LIMITS.activityCreate)
        .run()
    })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: { code: 'activity_quota' } })
    expect(writes).toEqual([])
    expect(await dailyUsed(h, uid)).toBe(DAILY_LIMITS.activityCreate)
  })
})

describe('a create that loses a race after its checks passed', () => {
  it('gives the day back and names the limit another request filled', async () => {
    let h: Harness | undefined
    const racing = racingDb(testEnv().DB, /^INSERT INTO daily_budget/, async () => {
      await h?.env.DB.prepare('UPDATE users SET activity_count = ?')
        .bind(MAX_ACTIVITIES_PER_USER)
        .run()
    })
    h = createHarness({}, { DB: racing })
    const token = await h.signIn()
    const uid = await userId(h, token)

    const res = await post(h, token)

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: { code: 'activity_quota' } })
    expect(await dailyUsed(h, uid)).toBe(0)
    expect(await activityRows(h)).toBe(0)
  })

  it('answers 409 account_deleting, not a quota, when the account starts deleting after its checks passed', async () => {
    // A deletion that starts after the session check and the create's checks, before its insert.
    let h: Harness | undefined
    const racing = racingDb(testEnv().DB, /^INSERT INTO daily_budget/, async () => {
      await h?.env.DB.prepare('UPDATE users SET deleting_at = ?').bind(START).run()
    })
    h = createHarness({}, { DB: racing })
    const token = await h.signIn()
    const uid = await userId(h, token)

    const res = await post(h, token)

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: { code: 'account_deleting' } })
    expect(await dailyUsed(h, uid)).toBe(0)
    expect(await activityRows(h)).toBe(0)
  })

  it('gives the day back and answers with the activity the other request wrote', async () => {
    let h: Harness | undefined
    let token = ''
    let winner: Response | undefined
    const racing = racingDb(testEnv().DB, /^INSERT INTO daily_budget/, async () => {
      winner = h && (await post(h, token))
    })
    h = createHarness({}, { DB: racing })
    token = await h.signIn()
    const uid = await userId(h, token)

    const res = await post(h, token)

    expect(winner?.status).toBe(201)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(await winner?.json())
    expect(await dailyUsed(h, uid)).toBe(1)
    expect(await activityRows(h)).toBe(1)
    expect(await count(h, 'SELECT activity_count AS n FROM users WHERE id = ?', uid)).toBe(1)
  })
})
