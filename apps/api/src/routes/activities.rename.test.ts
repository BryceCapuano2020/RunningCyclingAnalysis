import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { DAILY_LIMITS, MAX_DIGEST_BYTES_PER_USER } from '@rca/contract'
import { describe, expect, it } from 'vitest'
import { utcDay } from '../budget.ts'
import { START, createHarness, digestFixture, type Harness } from '../test/harness.ts'
import { seedActivityRow } from '../test/seed.ts'

const HASH = 'e'.repeat(64)

function as(token: string) {
  return { cookies: { rca_session: token } }
}

async function account(h: Harness, email = 'rider@example.com') {
  const token = await h.signIn(email)
  const me = (await (await h.send({ path: '/api/me', ...as(token) })).json()) as {
    user: { id: string }
  }
  return { token, userId: me.user.id }
}

function rename(h: Harness, token: string, id: string, body: unknown) {
  return h.send({ method: 'PATCH', path: `/api/activities/${id}/name`, json: body, ...as(token) })
}

async function seed(h: Harness, userId: string, revision = MODEL_REVISION) {
  return seedActivityRow(h.env.DB, {
    userId,
    revision,
    fileHash: HASH,
    digest: { id: 'source-1', startMs: START, name: 'Morning Ride' },
  })
}

async function row(h: Harness, id: string) {
  const found = await h.env.DB.prepare(
    'SELECT name, name_override AS override, digest_json FROM activities WHERE id = ?',
  )
    .bind(id)
    .first<{ name: string; override: string | null; digest_json: string }>()
  return { ...found!, digest: JSON.parse(found!.digest_json) as { name: string } }
}

async function counters(h: Harness, userId: string) {
  const counter = await h.env.DB.prepare(
    'SELECT digest_bytes AS n, library_version AS v FROM users WHERE id = ?',
  )
    .bind(userId)
    .first<{ n: number; v: number }>()
  const actual = await h.env.DB.prepare(
    'SELECT coalesce(sum(length(CAST(digest_json AS BLOB))), 0) AS n FROM activities WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ n: number }>()
  return { counter: counter!.n, actual: actual!.n, version: counter!.v }
}

describe('PATCH /api/activities/:id/name', () => {
  it('needs a signed-in account', async () => {
    const h = createHarness()
    const res = await h.send({
      method: 'PATCH',
      path: '/api/activities/x/name',
      json: { name: 'A' },
    })
    expect(res.status).toBe(401)
  })

  it('sets the name in the digest, the column and the override, and moves the counters exactly', async () => {
    const h = createHarness()
    const { token, userId } = await account(h)
    const id = await seed(h, userId)
    const before = await counters(h, userId)

    const res = await rename(h, token, id, { name: '  Hill repeats, café stop  ' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ name: 'Hill repeats, café stop' })
    expect(await row(h, id)).toMatchObject({
      name: 'Hill repeats, café stop',
      override: 'Hill repeats, café stop',
      digest: { name: 'Hill repeats, café stop' },
    })
    const after = await counters(h, userId)
    expect(after.counter).toBe(after.actual)
    expect(after.version).toBe(before.version + 1)
  })

  it('keeps the counter exact when the name shrinks, and keeps the revision', async () => {
    const h = createHarness()
    const { token, userId } = await account(h)
    const id = await seed(h, userId)
    await rename(h, token, id, { name: 'A very long name for a short easy spin around the park' })
    await rename(h, token, id, { name: 'Spin' })
    const sizes = await counters(h, userId)
    expect(sizes.counter).toBe(sizes.actual)
    expect((await row(h, id)).digest).toMatchObject({ name: 'Spin', modelRevision: MODEL_REVISION })
  })

  it('refuses a name that is empty, too long or not text, and charges nothing', async () => {
    const h = createHarness()
    const { token, userId } = await account(h)
    const id = await seed(h, userId)
    for (const name of ['', '   ', 'x'.repeat(101), 'a\nb', 4]) {
      expect((await rename(h, token, id, { name })).status).toBe(400)
    }
    expect((await rename(h, token, id, {})).status).toBe(400)
    expect((await row(h, id)).override).toBeNull()
    const used = await h.env.DB.prepare(
      `SELECT count(*) AS n FROM daily_budget WHERE user_id = ? AND action = 'profileWrite'`,
    )
      .bind(userId)
      .first<{ n: number }>()
    expect(used!.n).toBe(0)
  })

  it('answers a foreign id and an unknown id alike, and leaves the other account alone', async () => {
    const h = createHarness()
    const mine = await account(h)
    const theirs = await account(h, 'other@example.com')
    const id = await seed(h, theirs.userId)
    const foreign = await rename(h, mine.token, id, { name: 'Mine now' })
    const unknown = await rename(h, mine.token, 'no-such-id', { name: 'Mine now' })
    expect(foreign.status).toBe(404)
    expect(await foreign.json()).toEqual(await unknown.json())
    expect(await row(h, id)).toMatchObject({ name: 'Morning Ride', override: null })
  })

  it('counts one profile-write unit and answers 429 when the day is spent', async () => {
    const h = createHarness()
    const { token, userId } = await account(h)
    const id = await seed(h, userId)
    await h.env.DB.prepare(
      `INSERT INTO daily_budget (user_id, day, action, used) VALUES (?, ?, 'profileWrite', ?)`,
    )
      .bind(userId, utcDay(START), DAILY_LIMITS.profileWrite)
      .run()
    expect((await rename(h, token, id, { name: 'Nope' })).status).toBe(429)
    expect((await row(h, id)).override).toBeNull()
  })

  it('refuses a name that grows the digest at the cap, but lets a shorter one through', async () => {
    const h = createHarness()
    const { token, userId } = await account(h)
    const id = await seed(h, userId)
    await h.env.DB.prepare('UPDATE users SET digest_bytes = ? WHERE id = ?')
      .bind(MAX_DIGEST_BYTES_PER_USER - 1, userId)
      .run()
    const grow = await rename(h, token, id, { name: 'A much longer name than the one it had' })
    expect(grow.status).toBe(403)
    expect(await row(h, id)).toMatchObject({ name: 'Morning Ride', override: null })
    expect((await rename(h, token, id, { name: 'Ride' })).status).toBe(200)
  })

  it('refuses an account that is being deleted, and changes nothing', async () => {
    const h = createHarness()
    const { token, userId } = await account(h)
    const id = await seed(h, userId)
    await h.env.DB.prepare('UPDATE users SET deleting_at = ? WHERE id = ?')
      .bind(START, userId)
      .run()
    expect((await rename(h, token, id, { name: 'Late' })).status).toBe(401)
    expect((await row(h, id)).override).toBeNull()
  })
})

describe('a rebuild of a renamed activity', () => {
  it('keeps the name the athlete set, in the digest and the row, with the counter exact', async () => {
    const h = createHarness()
    const { token, userId } = await account(h)
    const id = await seed(h, userId, MODEL_REVISION - 1)
    await rename(h, token, id, { name: 'Club ride' })

    const res = await h.send({
      method: 'POST',
      path: '/api/activities',
      json: {
        digest: digestFixture({ id: 'source-1', startMs: START, name: 'Morning Ride' }),
        fileName: 'ride.fit',
        fileHash: HASH,
      },
      ...as(token),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      id,
      digest: { name: 'Club ride', modelRevision: MODEL_REVISION },
    })
    expect(await row(h, id)).toMatchObject({
      name: 'Club ride',
      override: 'Club ride',
      digest: { name: 'Club ride', modelRevision: MODEL_REVISION },
    })
    const sizes = await counters(h, userId)
    expect(sizes.counter).toBe(sizes.actual)
  })

  it('gives the file name back to an activity that was never renamed', async () => {
    const h = createHarness()
    const { token, userId } = await account(h)
    const id = await seed(h, userId, MODEL_REVISION - 1)
    await h.send({
      method: 'POST',
      path: '/api/activities',
      json: {
        digest: digestFixture({ id: 'source-1', startMs: START, name: 'Evening Ride' }),
        fileName: 'ride.fit',
        fileHash: HASH,
      },
      ...as(token),
    })
    expect(await row(h, id)).toMatchObject({ name: 'Evening Ride', override: null })
  })
})
