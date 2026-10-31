import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { describe, expect, it, vi } from 'vitest'
import {
  DAILY_LIMITS,
  DATABASE_SOFT_LIMIT_BYTES,
  MAX_DIGEST_BYTES,
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
import { seedActivityRow } from '../test/seed.ts'
import { bulk } from '../test/sized.ts'
import { sha256Hex } from '../util.ts'

const CONTENT = new TextEncoder().encode('0123 fake FIT bytes')
const HASH_OF_CONTENT = await sha256Hex(CONTENT)

function as(token: string) {
  return { cookies: { rca_session: token } }
}

async function userId(h: Harness, token: string): Promise<string> {
  const me = (await (await h.send({ path: '/api/me', ...as(token) })).json()) as {
    user: { id: string }
  }
  return me.user.id
}

/** POST /api/activities, optionally with a query string such as `?replace=<id>`. */
async function createActivity(
  h: Harness,
  token: string,
  overrides: Record<string, unknown> = {},
  digest: Record<string, unknown> = {},
  query = '',
): Promise<Response> {
  if (h.env.FILES) {
    const enabled = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: true },
      ...as(token),
    })
    expect(enabled.status).toBe(200)
  }
  return h.send({
    method: 'POST',
    path: `/api/activities${query}`,
    json: {
      digest: digestFixture(digest),
      fileName: 'ride.fit',
      fileHash: HASH_OF_CONTENT,
      ...overrides,
    },
    ...as(token),
  })
}

async function idOf(res: Response): Promise<string> {
  return ((await res.json()) as { id: string }).id
}

/** Stores an activity from a stale model straight into D1, as an older build left it: create refuses one. */
async function seedStale(
  h: Harness,
  token: string,
  digest: Record<string, unknown> = {},
): Promise<string> {
  if (h.env.FILES) {
    const enabled = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: true },
      ...as(token),
    })
    expect(enabled.status).toBe(200)
  }
  return seedActivityRow(h.env.DB, {
    userId: await userId(h, token),
    revision: 1,
    digest,
    fileHash: HASH_OF_CONTENT,
  })
}

async function pageOf(h: Harness, token: string, query: string) {
  const res = await h.send({ path: `/api/activities${query}`, cookies: { rca_session: token } })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

function itemsOf(body: Record<string, unknown>): { id: string }[] {
  return body.items as { id: string }[]
}

function nextOf(body: Record<string, unknown>): string | null {
  return body.nextCursor as string | null
}

/** Sets the daily count of one action for the harness's current UTC day. */
async function setDailyUsed(h: Harness, uid: string, action: string, used: number): Promise<void> {
  await h.env.DB.prepare(
    `INSERT INTO daily_budget (user_id, day, action, used) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, day, action) DO UPDATE SET used = excluded.used`,
  )
    .bind(uid, utcDay(START), action, used)
    .run()
}

/** Every read unit the user has spent today, across list requests. */
async function readsUsed(h: Harness, uid: string): Promise<number> {
  const row = await h.env.DB.prepare(
    `SELECT coalesce(sum(used), 0) AS n FROM daily_budget WHERE user_id = ? AND action = 'read'`,
  )
    .bind(uid)
    .first<{ n: number }>()
  return row?.n ?? 0
}

/** The stored counter next to the bytes the user's rows really hold. They must always agree. */
async function digestBytes(h: Harness, uid: string): Promise<{ counter: number; actual: number }> {
  const row = await h.env.DB.prepare(
    `SELECT users.digest_bytes AS counter,
       (SELECT coalesce(sum(length(CAST(digest_json AS BLOB))), 0) FROM activities
         WHERE user_id = users.id) AS actual
     FROM users WHERE id = ?`,
  )
    .bind(uid)
    .first<{ counter: number; actual: number }>()
  if (!row) throw new Error('user row missing')
  return row
}

async function setDatabaseBytes(h: Harness, bytes: number): Promise<void> {
  await h.env.DB.prepare(
    `INSERT INTO r2_storage_budget (id, lifetime_put_bytes, monthly_period, monthly_operations,
       monthly_put_bytes, d1_size_bytes)
     VALUES (1, 0, '2026-01', 0, 0, ?)
     ON CONFLICT(id) DO UPDATE SET d1_size_bytes = excluded.d1_size_bytes`,
  )
    .bind(bytes)
    .run()
}

async function databaseBytes(h: Harness): Promise<number> {
  const row = await h.env.DB.prepare(
    'SELECT d1_size_bytes AS n FROM r2_storage_budget WHERE id = 1',
  ).first<{ n: number }>()
  return row?.n ?? 0
}

async function storedDigestBytesOf(h: Harness, id: string): Promise<number> {
  const row = await h.env.DB.prepare(
    'SELECT length(CAST(digest_json AS BLOB)) AS n FROM activities WHERE id = ?',
  )
    .bind(id)
    .first<{ n: number }>()
  if (!row) throw new Error('activity row missing')
  return row.n
}

async function rowCount(h: Harness): Promise<number> {
  const row = await h.env.DB.prepare('SELECT COUNT(*) AS n FROM activities').first<{ n: number }>()
  return row?.n ?? 0
}

describe('distance bests', () => {
  const bests = [
    { distanceM: 1000, seconds: 250 },
    { distanceM: 5000, seconds: 1250 },
  ]
  const run = { sport: 'run', powerSource: 'none', durationS: 2500, distanceM: 10000 }

  it('stores a run digest with its distance bests and returns them from the list', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const created = await createActivity(h, token, {}, { ...run, distanceBests: bests })
    expect(created.status).toBe(201)
    const page = await pageOf(h, token, '')
    expect(itemsOf(page.body)).toHaveLength(1)
    expect(page.body.items).toMatchObject([{ digest: { distanceBests: bests } }])
  })

  it('stores a digest without the field, as older clients send it', async () => {
    const h = createHarness()
    const token = await h.signIn()
    expect((await createActivity(h, token, {}, run)).status).toBe(201)
    const page = await pageOf(h, token, '')
    const [item] = page.body.items as { digest: object }[]
    expect(item?.digest).toMatchObject({ sport: 'run' })
    expect(item?.digest).not.toHaveProperty('distanceBests')
  })

  it('refuses distance bests on a ride', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const ride = await createActivity(h, token, {}, { distanceBests: bests })
    expect(ride.status).toBe(400)
  })
})

describe('per-user digest byte quota', () => {
  it('refuses a create past the digest byte cap with 403 digest_quota and stores nothing', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    await h.env.DB.prepare('UPDATE users SET digest_bytes = ? WHERE id = ?')
      .bind(MAX_DIGEST_BYTES_PER_USER - 10, uid)
      .run()

    const refused = await createActivity(h, token, {}, { name: 'Too big for what is left' })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ error: { code: 'digest_quota' } })
    expect(await rowCount(h)).toBe(0)
    expect(await digestBytes(h, uid)).toEqual({
      counter: MAX_DIGEST_BYTES_PER_USER - 10,
      actual: 0,
    })
  })

  it('charges the stored digest bytes on create and refunds them on delete', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    const first = await idOf(await createActivity(h, token, {}, { name: 'First' }))
    const size = await storedDigestBytesOf(h, first)
    expect(await digestBytes(h, uid)).toEqual({ counter: size, actual: size })

    await idOf(await createActivity(h, token, {}, { name: 'Second', startMs: START + 60_000 }))
    expect((await digestBytes(h, uid)).counter).toBeGreaterThan(size)
    await h.send({ method: 'DELETE', path: `/api/activities/${first}`, ...as(token) })
    const after = await digestBytes(h, uid)
    expect(after.counter).toBe(after.actual)
    expect(after.counter).toBeGreaterThan(0)
  })

  it('charges only the size difference when an activity is upgraded to a newer digest', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    const id = await seedStale(h, token, { name: 'a' })
    const before = await storedDigestBytesOf(h, id)
    const upgrade = await createActivity(
      h,
      token,
      {},
      { modelRevision: MODEL_REVISION, name: 'a much longer name for the same ride' },
    )
    expect(upgrade.status).toBe(200)
    const after = await storedDigestBytesOf(h, id)
    expect(after).toBeGreaterThan(before)
    expect(await digestBytes(h, uid)).toEqual({ counter: after, actual: after })
  })

  it('refuses an upgrade that would take the user past the cap, and keeps the old digest', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    const id = await seedStale(h, token, { name: 'a' })
    const before = await storedDigestBytesOf(h, id)
    await h.env.DB.prepare('UPDATE users SET digest_bytes = ? WHERE id = ?')
      .bind(MAX_DIGEST_BYTES_PER_USER - before, uid)
      .run()

    const refused = await createActivity(
      h,
      token,
      {},
      { modelRevision: MODEL_REVISION, ...bulk(MAX_DIGEST_BYTES / 2) },
    )
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ error: { code: 'digest_quota' } })
    expect(await storedDigestBytesOf(h, id)).toBe(before)
    // The refused upgrade leaves the counter exactly where it was.
    expect((await digestBytes(h, uid)).counter).toBe(MAX_DIGEST_BYTES_PER_USER - before)
  })

  it('answers a same-revision retry from the stored digest at the cap, without a quota refusal', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    const id = await idOf(
      await createActivity(h, token, {}, { modelRevision: MODEL_REVISION, name: 'a' }),
    )
    await h.env.DB.prepare('UPDATE users SET digest_bytes = ? WHERE id = ?')
      .bind(MAX_DIGEST_BYTES_PER_USER, uid)
      .run()

    // Not an upgrade: the stored revision is already current, so no quota is needed.
    const retry = await createActivity(
      h,
      token,
      {},
      { modelRevision: MODEL_REVISION, name: 'a much longer name for the same ride' },
    )
    expect(retry.status).toBe(200)
    expect(await idOf(retry)).toBe(id)
    expect((await digestBytes(h, uid)).counter).toBe(MAX_DIGEST_BYTES_PER_USER)
  })

  it('gives back the reserved bytes when the digest update fails after the reservation', async () => {
    let failing = false
    const real = testEnv().DB
    const flaky = new Proxy(real, {
      get(target, property) {
        if (property === 'prepare') {
          return (query: string) => {
            if (failing && /^update\s+[`"]?activities[`"]?\s/i.test(query))
              throw new Error('D1 unavailable')
            return target.prepare(query)
          }
        }
        const value: unknown = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const h = createHarness({}, { DB: flaky })
    const token = await h.signIn()
    const uid = await userId(h, token)
    const id = await seedStale(h, token, { name: 'a' })
    const before = await storedDigestBytesOf(h, id)

    failing = true
    const res = await createActivity(
      h,
      token,
      {},
      { modelRevision: MODEL_REVISION, name: 'a much longer name for the same ride' },
    )
    failing = false
    expect(res.status).toBe(500)
    expect(await digestBytes(h, uid)).toEqual({ counter: before, actual: before })
  })

  it('never refuses an upgrade that shrinks the digest, even above the cap', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    const id = await seedStale(h, token, { name: 'a long original name' })
    await h.env.DB.prepare('UPDATE users SET digest_bytes = ? WHERE id = ?')
      .bind(MAX_DIGEST_BYTES_PER_USER + 1000, uid)
      .run()

    const shrink = await createActivity(h, token, {}, { modelRevision: MODEL_REVISION, name: 'a' })
    expect(shrink.status).toBe(200)
    expect((await digestBytes(h, uid)).counter).toBeLessThan(MAX_DIGEST_BYTES_PER_USER + 1000)
    expect(await storedDigestBytesOf(h, id)).toBeGreaterThan(0)
  })

  it('keeps the counter equal to the stored bytes through creates, upgrades and deletes', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    const a = await seedStale(h, token, { name: 'a' })
    const b = await idOf(
      await createActivity(h, token, {}, { name: 'bbbb', startMs: START + 60_000 }),
    )
    await createActivity(
      h,
      token,
      {},
      { modelRevision: MODEL_REVISION, name: 'upgraded', startMs: START },
    )
    await h.send({ method: 'DELETE', path: `/api/activities/${b}`, ...as(token) })
    expect(await digestBytes(h, uid)).toEqual({
      counter: await storedDigestBytesOf(h, a),
      actual: await storedDigestBytesOf(h, a),
    })
  })
})

describe('database size guard', () => {
  it('refuses a new create with 503 database_full when the last-seen size is over the soft limit', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    await setDailyUsed(h, uid, 'read', 0)
    await setDatabaseBytes(h, DATABASE_SOFT_LIMIT_BYTES + 1)

    const refused = await createActivity(h, token)
    expect(refused.status).toBe(503)
    expect(await refused.json()).toMatchObject({ error: { code: 'database_full' } })
    expect(await rowCount(h)).toBe(0)
    expect(await readsUsed(h, uid)).toBe(0)
    const daily = await h.env.DB.prepare(
      `SELECT coalesce(used, 0) AS n FROM daily_budget WHERE user_id = ? AND action = 'activityCreate'`,
    )
      .bind(uid)
      .first<{ n: number }>()
    expect(daily?.n ?? 0).toBe(0)
  })

  it('allows a create when the last-seen size is exactly at the soft limit', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await setDatabaseBytes(h, DATABASE_SOFT_LIMIT_BYTES)
    expect((await createActivity(h, token)).status).toBe(201)
  })

  it('records the database size after a create, so the guard sees the growth', async () => {
    const h = createHarness()
    const token = await h.signIn()
    expect(await databaseBytes(h)).toBe(0)
    await idOf(await createActivity(h, token))
    expect(await databaseBytes(h)).toBeGreaterThan(0)
  })

  it('admits creates again once a delete records a size under the limit', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const first = await idOf(await createActivity(h, token, {}, { name: 'First' }))
    await setDatabaseBytes(h, DATABASE_SOFT_LIMIT_BYTES + 1)
    const second = { name: 'Second', startMs: START + 60_000 }
    expect((await createActivity(h, token, {}, second)).status).toBe(503)

    const deleted = await h.send({
      method: 'DELETE',
      path: `/api/activities/${first}`,
      ...as(token),
    })
    expect(deleted.status).toBe(204)
    expect(await databaseBytes(h)).toBeLessThanOrEqual(DATABASE_SOFT_LIMIT_BYTES)
    expect((await createActivity(h, token, {}, second)).status).toBe(201)
  })

  it('refuses an upgrade that grows the digest while the database is over the limit, with 503', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    const id = await seedStale(h, token, { name: 'a' })
    const before = await storedDigestBytesOf(h, id)
    await setDatabaseBytes(h, DATABASE_SOFT_LIMIT_BYTES + 1)

    const refused = await createActivity(
      h,
      token,
      {},
      { modelRevision: MODEL_REVISION, name: 'a much longer name for the same ride' },
    )
    expect(refused.status).toBe(503)
    expect(await refused.json()).toMatchObject({ error: { code: 'database_full' } })
    expect(await storedDigestBytesOf(h, id)).toBe(before)
    expect(await digestBytes(h, uid)).toEqual({ counter: before, actual: before })
  })

  it('records the database size after an upgrade, so the guard sees the growth', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await seedStale(h, token, { name: 'a' })
    await setDatabaseBytes(h, 0)

    const upgrade = await createActivity(
      h,
      token,
      {},
      { modelRevision: MODEL_REVISION, name: 'a much longer name for the same ride' },
    )
    expect(upgrade.status).toBe(200)
    expect(await databaseBytes(h)).toBeGreaterThan(0)
  })

  it('still returns an existing activity and accepts upgrades while the database is over the limit', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await seedStale(h, token)
    await setDatabaseBytes(h, DATABASE_SOFT_LIMIT_BYTES + 1)

    const again = await createActivity(h, token, {}, { modelRevision: 1 })
    expect(again.status).toBe(409)
    expect(await again.json()).toMatchObject({ error: { code: 'app_outdated' } })
    const upgrade = await createActivity(h, token, {}, { modelRevision: MODEL_REVISION })
    expect(upgrade.status).toBe(200)
    expect(await idOf(upgrade)).toBe(id)
  })
})

describe('POST /api/activities?replace=<id>', () => {
  it('updates the exact row the caller names and never inserts', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await seedStale(h, token, { name: 'old' })
    const res = await createActivity(
      h,
      token,
      {},
      { modelRevision: MODEL_REVISION, name: 'rebuilt' },
      `?replace=${id}`,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      id,
      digest: { modelRevision: MODEL_REVISION, name: 'rebuilt' },
    })
    expect(await rowCount(h)).toBe(1)
  })

  it('returns 404 not_found when the named activity was deleted in another tab, and does not re-insert it', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await seedStale(h, token)
    expect(
      (await h.send({ method: 'DELETE', path: `/api/activities/${id}`, ...as(token) })).status,
    ).toBe(204)

    const res = await createActivity(
      h,
      token,
      {},
      { modelRevision: MODEL_REVISION },
      `?replace=${id}`,
    )
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: { code: 'not_found' } })
    expect(await rowCount(h)).toBe(0)
  })

  it("returns 404 for another user's activity and leaves it unchanged", async () => {
    const h = createHarness()
    const alice = await h.signIn('alice@example.com', 'Alice')
    const bob = await h.signIn('bob@example.com', 'Bob')
    const id = await seedStale(h, alice, { name: 'mine' })
    const before = await storedDigestBytesOf(h, id)

    const res = await createActivity(
      h,
      bob,
      {},
      { modelRevision: MODEL_REVISION, name: 'stolen' },
      `?replace=${id}`,
    )
    expect(res.status).toBe(404)
    expect(await storedDigestBytesOf(h, id)).toBe(before)
  })

  it('refuses a replacement for a different file or a different start with 409 activity_conflict', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await seedStale(h, token)

    const otherFile = await createActivity(
      h,
      token,
      { fileHash: 'a'.repeat(64) },
      { modelRevision: MODEL_REVISION },
      `?replace=${id}`,
    )
    expect(otherFile.status).toBe(409)
    expect(await otherFile.json()).toMatchObject({ error: { code: 'activity_conflict' } })

    const otherStart = await createActivity(
      h,
      token,
      {},
      { modelRevision: MODEL_REVISION, startMs: START + 60_000 },
      `?replace=${id}`,
    )
    expect(otherStart.status).toBe(409)
    expect(await otherStart.json()).toMatchObject({ error: { code: 'activity_conflict' } })
  })

  it('leaves the row unchanged when the replacement is not a newer model revision', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(
      await createActivity(h, token, {}, { modelRevision: MODEL_REVISION, name: 'current' }),
    )
    const res = await createActivity(
      h,
      token,
      {},
      { modelRevision: 1, name: 'stale tab' },
      `?replace=${id}`,
    )
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: { code: 'app_outdated' } })
    const stored = await h.env.DB.prepare('SELECT digest_json FROM activities WHERE id = ?')
      .bind(id)
      .first<{ digest_json: string }>()
    expect(JSON.parse(stored!.digest_json)).toMatchObject({
      modelRevision: MODEL_REVISION,
      name: 'current',
    })
  })

  it('charges only the size difference, and uses no daily create unit', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    const id = await seedStale(h, token, { name: 'a' })
    const usedBefore = await h.env.DB.prepare(
      `SELECT coalesce(used, 0) AS n FROM daily_budget WHERE user_id = ? AND action = 'activityCreate'`,
    )
      .bind(uid)
      .first<{ n: number }>()
    await createActivity(
      h,
      token,
      {},
      { modelRevision: MODEL_REVISION, name: 'a longer replacement name' },
      `?replace=${id}`,
    )
    const after = await storedDigestBytesOf(h, id)
    expect(await digestBytes(h, uid)).toEqual({ counter: after, actual: after })
    const usedAfter = await h.env.DB.prepare(
      `SELECT coalesce(used, 0) AS n FROM daily_budget WHERE user_id = ? AND action = 'activityCreate'`,
    )
      .bind(uid)
      .first<{ n: number }>()
    expect(usedAfter?.n ?? 0).toBe(usedBefore?.n ?? 0)
  })

  it('rejects an empty replace parameter with 400', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await createActivity(h, token, {}, {}, '?replace=')
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'invalid_request' } })
  })
})

describe('GET /api/activities read budget', () => {
  it('charges the read budget once for a whole listing walked by cursors', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    for (let i = 0; i < 12; i += 1) {
      await createActivity(h, token, {}, { startMs: START + i * 60_000 })
    }
    const baseline = await readsUsed(h, uid)
    let cursor: string | null = null
    let pages = 0
    do {
      const page = await pageOf(h, token, `?limit=1${cursor ? `&cursor=${cursor}` : ''}`)
      expect(page.status).toBe(200)
      pages += 1
      cursor = nextOf(page.body)
    } while (cursor)
    expect(pages).toBe(12)
    expect((await readsUsed(h, uid)) - baseline).toBe(1)
  })

  it('serves continuation pages even when the read budget is spent', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    for (let i = 0; i < 3; i += 1) {
      await createActivity(h, token, {}, { startMs: START + i * 60_000 })
    }
    const first = await pageOf(h, token, '?limit=1')
    await setDailyUsed(h, uid, 'read', DAILY_LIMITS.read)

    const second = await pageOf(h, token, `?limit=1&cursor=${nextOf(first.body)}`)
    expect(second.status).toBe(200)
    const third = await pageOf(h, token, `?limit=1&cursor=${nextOf(second.body)}`)
    expect(third.status).toBe(200)
    expect(nextOf(third.body)).toBeNull()

    const fresh = await pageOf(h, token, '?limit=1')
    expect(fresh.status).toBe(429)
    expect(fresh.body).toMatchObject({ error: { code: 'daily_limit' } })
  })

  it('refuses an undecodable cursor with 400 before any read unit is taken', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    await createActivity(h, token, {}, { startMs: START })
    await setDailyUsed(h, uid, 'read', DAILY_LIMITS.read)
    const bad = await pageOf(h, token, '?cursor=not+valid')
    expect(bad.status).toBe(400)
    expect(await readsUsed(h, uid)).toBe(DAILY_LIMITS.read)
  })

  it('refuses a cross-site request for a cursor without spending the cursor or a read unit', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    for (let i = 0; i < 3; i += 1) {
      await createActivity(h, token, {}, { startMs: START + i * 60_000 })
    }
    const first = await pageOf(h, token, '?limit=1')
    const cursor = nextOf(first.body)
    const baseline = await readsUsed(h, uid)

    const crossSite = await h.send({
      path: `/api/activities?limit=1&cursor=${cursor}`,
      headers: { 'Sec-Fetch-Site': 'cross-site' },
      cookies: { rca_session: token },
    })
    expect(crossSite.status).toBe(403)
    expect(await readsUsed(h, uid)).toBe(baseline)

    // The cursor the app issued is still free to spend once.
    const second = await pageOf(h, token, `?limit=1&cursor=${cursor}`)
    expect(second.status).toBe(200)
    expect(await readsUsed(h, uid)).toBe(baseline)
  })
})

/** Stores a row exactly as an older deployment could have, bypassing the create route. */
async function insertRawActivity(
  h: Harness,
  uid: string,
  id: string,
  digestJson: string,
  createdAt: number,
): Promise<void> {
  await h.env.DB.prepare(
    `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
       digest_json, file_name, file_hash, created_at)
     VALUES (?, ?, ?, 'ride', ?, 'legacy', 1, ?, 'ride.fit', ?, ?)`,
  )
    .bind(id, uid, `legacy-${id}`, createdAt, digestJson, HASH_OF_CONTENT, createdAt)
    .run()
}

describe('a create that finds its activity already stored with a digest that cannot be read', () => {
  it('answers with the digest it sent, not a server error, when the stored one is out of bounds', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const first = await createActivity(h, token, {}, { startMs: START })
    expect(first.status).toBe(201)
    const id = await idOf(first)
    // A row a bound has since refused, at the same revision, so the create does not replace it.
    await h.env.DB.prepare(
      "UPDATE activities SET digest_json = json_set(digest_json, '$.startMs', 1e300) WHERE id = ?",
    )
      .bind(id)
      .run()

    const again = await createActivity(h, token, {}, { startMs: START })
    expect(again.status).toBe(200)
    const body = (await again.json()) as { id: string; digest: { startMs: number } }
    expect(body.id).toBe(id)
    expect(body.digest.startMs).toBe(START)
  })
})

describe('GET /api/activities with unreadable stored rows', () => {
  it('skips a stored row that is not JSON, counts it, and still returns the valid rows', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    const valid = await idOf(await createActivity(h, token, {}, { startMs: START }))
    await insertRawActivity(h, uid, 'bad-row', '{"version":', START + 10_000)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const page = await pageOf(h, token, '')
    expect(page.status).toBe(200)
    expect(itemsOf(page.body).map((r) => r.id)).toEqual([valid])
    expect(page.body).toMatchObject({ nextCursor: null, unreadable: 1 })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"activityId":"bad-row"'))
    expect(warn.mock.calls.flat().join(' ')).not.toContain('"version"')
    warn.mockRestore()
  })

  it('walks past skipped rows page by page without an empty page that still has a cursor', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    const oldValid = await idOf(await createActivity(h, token, {}, { startMs: START }))
    await insertRawActivity(h, uid, 'bad-1', '{"version":', START + 1_000)
    await insertRawActivity(h, uid, 'bad-2', 'not json', START + 2_000)
    h.clock.now = START + 3_000
    const newValid = await idOf(await createActivity(h, token, {}, { startMs: START + 3_000 }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const seen: string[] = []
    let unreadable = 0
    let cursor: string | null = null
    let pages = 0
    do {
      const page = await pageOf(h, token, `?limit=1${cursor ? `&cursor=${cursor}` : ''}`)
      expect(page.status).toBe(200)
      expect(
        itemsOf(page.body).length + ((page.body.unreadable as number | undefined) ?? 0),
      ).toBeGreaterThan(0)
      seen.push(...itemsOf(page.body).map((r) => r.id))
      unreadable += (page.body.unreadable as number | undefined) ?? 0
      cursor = nextOf(page.body)
      pages += 1
      expect(pages).toBeLessThan(10)
    } while (cursor)
    warn.mockRestore()
    expect(seen).toEqual([newValid, oldValid])
    expect(unreadable).toBe(2)
  })

  it('caps the rows one request scans, and returns a cursor after the last row it examined', async () => {
    const counted = countingDb(testEnv().DB)
    const h = createHarness({}, { DB: counted.db })
    const token = await h.signIn()
    const uid = await userId(h, token)
    const valid = await idOf(await createActivity(h, token, {}, { startMs: START }))
    // Unreadable rows that are newer than the valid one, so a listing meets them first.
    await seedUnreadableActivities(h, uid, 650, START + 1_000)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    counted.reset()
    const first = await pageOf(h, token, '?limit=25')
    expect(counted.count()).toBeLessThanOrEqual(50)
    // Eight database pages, each selecting a full page of 25 unreadable rows, and no item.
    expect(first.body).toMatchObject({ items: [], unreadable: 200 })
    expect(nextOf(first.body)).not.toBeNull()

    const seen: string[] = []
    let cursor = nextOf(first.body)
    let pages = 1
    while (cursor !== null) {
      const page = await pageOf(h, token, `?limit=25&cursor=${cursor}`)
      seen.push(...itemsOf(page.body).map((r) => r.id))
      cursor = nextOf(page.body)
      pages += 1
      expect(pages).toBeLessThan(100)
    }
    warn.mockRestore()
    expect(seen).toEqual([valid])
    expect(await readsUsed(h, uid)).toBe(1)
  })
})

/** Inserts rows whose digest is not JSON, in one statement. */
async function seedUnreadableActivities(
  h: Harness,
  uid: string,
  count: number,
  firstCreatedAt: number,
): Promise<void> {
  await h.env.DB.prepare(
    `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
     INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
       digest_json, file_name, file_hash, created_at)
     SELECT 'bad-' || i, ?, 'bad-' || i, 'ride', i, 'legacy', 1, '{"version":', 'ride.fit',
       'h', ? + i FROM n`,
  )
    .bind(count, uid, firstCreatedAt)
    .run()
}
