import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { withRevisionTableAsync } from '@rca/core/digest/revisions'
import type { RevisionDeclaration } from '@rca/core/digest/revisions'
import { describe, expect, it } from 'vitest'
import { DAILY_LIMITS, MAX_DIGEST_BYTES_PER_USER, MAX_LABELS_PER_REQUEST } from '@rca/contract'
import { utcDay } from '../budget.ts'
import { START, createHarness, digestFixture, testEnv, type Harness } from '../test/harness.ts'
import { racingDb } from '../test/racingDb.ts'
import { seedActivityRow } from '../test/seed.ts'

const HASH = 'c'.repeat(64)
type Label = 'walk' | 'hike' | 'ski' | 'other' | null
interface Change {
  id: string
  revision: number
  from: Label
  athleteType: Label
}

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

function patch(h: Harness, token: string, labels: unknown, raw?: Uint8Array): Promise<Response> {
  const path = '/api/activities/labels'
  if (raw !== undefined) {
    return h.send({
      method: 'PATCH',
      path,
      raw,
      headers: { 'content-type': 'application/json' },
      ...as(token),
    })
  }
  return h.send({ method: 'PATCH', path, json: { labels }, ...as(token) })
}

let seeded = 0
/** A stored row at a revision, with its own start time so rows never collide. */
async function seed(h: Harness, userId: string, revision = MODEL_REVISION, athleteType?: Label) {
  seeded += 1
  return seedActivityRow(h.env.DB, {
    userId,
    revision,
    fileHash: HASH,
    digest: {
      id: `source-${seeded}`,
      startMs: START + seeded * 60_000,
      ...(athleteType === undefined || athleteType === null ? {} : { athleteType }),
    },
  })
}

async function stored(h: Harness, id: string) {
  const row = await h.env.DB.prepare('SELECT digest_json FROM activities WHERE id = ?')
    .bind(id)
    .first<{ digest_json: string }>()
  return JSON.parse(row!.digest_json) as Record<string, unknown>
}

/** The user's counter and the bytes their digests really take: they must agree after every change. */
async function bytes(h: Harness, userId: string) {
  const counter = await h.env.DB.prepare('SELECT digest_bytes AS n FROM users WHERE id = ?')
    .bind(userId)
    .first<{ n: number }>()
  const actual = await h.env.DB.prepare(
    'SELECT coalesce(sum(length(CAST(digest_json AS BLOB))), 0) AS n FROM activities WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ n: number }>()
  return { counter: counter!.n, actual: actual!.n }
}

async function profileWrites(h: Harness): Promise<number> {
  const row = await h.env.DB.prepare(
    `SELECT coalesce(sum(used), 0) AS n FROM daily_budget WHERE action = 'profileWrite'`,
  ).first<{ n: number }>()
  return row?.n ?? 0
}

const change = (
  id: string,
  from: Label,
  athleteType: Label,
  revision = MODEL_REVISION,
): Change => ({
  id,
  revision,
  from,
  athleteType,
})

describe('PATCH /api/activities/labels', () => {
  it('needs a signed-in account', async () => {
    const h = createHarness()
    const res = await h.send({
      method: 'PATCH',
      path: '/api/activities/labels',
      json: { labels: [] },
    })
    expect(res.status).toBe(401)
  })

  it('sets, changes and clears a label in place, keeping the revision and the counter exact', async () => {
    const h = createHarness()
    const { token, userId } = await account(h)
    const id = await seed(h, userId)
    const before = await stored(h, id)

    let res = await patch(h, token, [change(id, null, 'hike')])
    expect(await res.json()).toEqual({ applied: 1, skipped: 0, refused: 0, missed: [] })
    expect(await stored(h, id)).toEqual({ ...before, athleteType: 'hike' })
    expect(await bytes(h, userId)).toEqual({
      counter: expect.any(Number),
      actual: expect.any(Number),
    })
    let sizes = await bytes(h, userId)
    expect(sizes.counter).toBe(sizes.actual)

    res = await patch(h, token, [change(id, 'hike', 'other')])
    expect((await res.json()) as { applied: number }).toMatchObject({ applied: 1 })
    expect((await stored(h, id)).athleteType).toBe('other')
    sizes = await bytes(h, userId)
    expect(sizes.counter).toBe(sizes.actual)

    res = await patch(h, token, [change(id, 'other', null)])
    expect((await res.json()) as { applied: number }).toMatchObject({ applied: 1 })
    expect(await stored(h, id)).toEqual(before)
    sizes = await bytes(h, userId)
    expect(sizes.counter).toBe(sizes.actual)
    expect((await stored(h, id)).modelRevision).toBe(MODEL_REVISION)
  })

  it('answers a foreign id and an unknown id alike, and leaves the other account alone', async () => {
    const h = createHarness()
    const mine = await account(h)
    const other = await account(h, 'other@example.com')
    const theirs = await seed(h, other.userId)
    const before = await stored(h, theirs)

    const res = await patch(h, mine.token, [
      change(theirs, null, 'walk'),
      change('no-such-activity', null, 'walk'),
    ])
    expect(await res.json()).toEqual({ applied: 0, skipped: 2, refused: 0, missed: [] })
    expect(await stored(h, theirs)).toEqual(before)
    const sizes = await bytes(h, other.userId)
    expect(sizes.counter).toBe(sizes.actual)
  })

  it('misses a row whose label is not the one the client read, and says what it holds now', async () => {
    const h = createHarness()
    const { token, userId } = await account(h)
    const id = await seed(h, userId, MODEL_REVISION, 'ski')

    const res = await patch(h, token, [change(id, 'walk', 'hike')])
    expect(await res.json()).toEqual({
      applied: 0,
      skipped: 0,
      refused: 0,
      missed: [{ id, revision: MODEL_REVISION, athleteType: 'ski' }],
    })
    expect((await stored(h, id)).athleteType).toBe('ski')
    // The client retries once from what it was told.
    const retry = await patch(h, token, [change(id, 'ski', 'hike')])
    expect(await retry.json()).toMatchObject({ applied: 1 })
    expect((await stored(h, id)).athleteType).toBe('hike')
  })

  it('misses a row a rebuild moved to another revision, and changes nothing', async () => {
    const h = createHarness()
    const { token, userId } = await account(h)
    // The client read this row as the current revision; it is older now (here: not yet rebuilt).
    const id = await seed(h, userId, MODEL_REVISION - 1)
    const before = await stored(h, id)

    const res = await patch(h, token, [change(id, null, 'walk')])
    expect(await res.json()).toEqual({
      applied: 0,
      skipped: 0,
      refused: 0,
      missed: [{ id, revision: MODEL_REVISION - 1, athleteType: null }],
    })
    expect(await stored(h, id)).toEqual(before)
    const sizes = await bytes(h, userId)
    expect(sizes.counter).toBe(sizes.actual)
  })

  it('is idempotent: the same change again is a miss that shows the label already set', async () => {
    const h = createHarness()
    const { token, userId } = await account(h)
    const id = await seed(h, userId)
    const first = await patch(h, token, [change(id, null, 'walk')])
    expect(await first.json()).toMatchObject({ applied: 1 })
    const again = await patch(h, token, [change(id, null, 'walk')])
    expect(await again.json()).toMatchObject({
      applied: 0,
      missed: [{ id, athleteType: 'walk' }],
    })
    const sizes = await bytes(h, userId)
    expect(sizes.counter).toBe(sizes.actual)
  })

  it('applies a batch across several D1 batches, one profile-write unit for the request', async () => {
    const h = createHarness()
    const { token, userId } = await account(h)
    const ids = await Promise.all(Array.from({ length: 60 }, () => seed(h, userId)))
    const res = await patch(
      h,
      token,
      ids.map((id, index) => change(id, null, index % 2 === 0 ? 'walk' : 'other')),
    )
    expect(await res.json()).toEqual({ applied: 60, skipped: 0, refused: 0, missed: [] })
    const sizes = await bytes(h, userId)
    expect(sizes.counter).toBe(sizes.actual)
    expect(await profileWrites(h)).toBe(1)
  })

  describe('the request', () => {
    it.each([
      ['an empty list', []],
      ['an unknown label', [{ id: 'a', revision: MODEL_REVISION, from: null, athleteType: 'run' }]],
      ['a missing from', [{ id: 'a', revision: MODEL_REVISION, athleteType: 'walk' }]],
      ['an activity named twice', [change('a', null, 'walk'), change('a', null, 'hike')]],
      ['a newer revision', [change('a', null, 'walk', MODEL_REVISION + 1)]],
      [
        'more than the most a request may carry',
        Array.from({ length: MAX_LABELS_PER_REQUEST + 1 }, (_, i) => change(`a${i}`, null, 'walk')),
      ],
    ])('refuses %s as invalid', async (_name, labels) => {
      const h = createHarness()
      const { token } = await account(h)
      const res = await patch(h, token, labels)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: { code: 'invalid_request' } })
      expect(await profileWrites(h)).toBe(0)
    })

    it('refuses a body that is not JSON, and one over 64 KB', async () => {
      const h = createHarness()
      const { token } = await account(h)
      const notJson = await patch(h, token, null, new TextEncoder().encode('{"labels": [nope'))
      expect(notJson.status).toBe(400)
      const big = await patch(h, token, null, new Uint8Array(65 * 1024).fill(32))
      expect(big.status).toBe(413)
    })

    it('refuses a revision that is not a whole number from 1 as invalid, before anything is charged', async () => {
      const h = createHarness()
      const { token, userId } = await account(h)
      const id = await seed(h, userId)
      for (const revision of [0, -1, 1.5, 'six', null, undefined]) {
        const res = await patch(h, token, [{ id, revision, from: null, athleteType: 'walk' }])
        expect(res.status, String(revision)).toBe(400)
      }
      expect((await stored(h, id)).athleteType).toBeUndefined()
      expect(await profileWrites(h)).toBe(0)
    })

    it('lets the revision check decide a stale claim: a miss if the row moved, a hit if it did not', async () => {
      const h = createHarness()
      const { token, userId } = await account(h)
      const moved = await seed(h, userId)
      const unmoved = await seed(h, userId, MODEL_REVISION - 1)
      const res = await patch(h, token, [
        change(moved, null, 'walk', MODEL_REVISION - 1),
        change(unmoved, null, 'walk', MODEL_REVISION - 1),
      ])
      expect(await res.json()).toEqual({
        applied: 1,
        skipped: 0,
        refused: 0,
        missed: [{ id: moved, revision: MODEL_REVISION, athleteType: null }],
      })
      expect((await stored(h, unmoved)).athleteType).toBe('walk')
      const sizes = await bytes(h, userId)
      expect(sizes.counter).toBe(sizes.actual)
    })

    it('counts one profile-write unit a request, and answers 429 when the day is spent', async () => {
      const h = createHarness()
      const { token, userId } = await account(h)
      const id = await seed(h, userId)
      await h.env.DB.prepare(
        `INSERT INTO daily_budget (user_id, day, action, used) VALUES (?, ?, 'profileWrite', ?)`,
      )
        .bind(userId, utcDay(START), DAILY_LIMITS.profileWrite)
        .run()
      const res = await patch(h, token, [change(id, null, 'walk')])
      expect(res.status).toBe(429)
      expect((await stored(h, id)).athleteType).toBeUndefined()
    })
  })

  it('keeps the counter equal to the real bytes after hits, misses, refusals and skips in one request', async () => {
    const h = createHarness()
    const mine = await account(h)
    const other = await account(h, 'other@example.com')
    const a = await seed(h, mine.userId)
    const b = await seed(h, mine.userId, MODEL_REVISION, 'ski')
    const c = await seed(h, mine.userId, MODEL_REVISION, 'hike')
    const d = await seed(h, mine.userId, MODEL_REVISION - 1)
    const e = await seed(h, mine.userId)
    const f = await seed(h, mine.userId)
    const theirs = await seed(h, other.userId)
    // A value that is not a label sits in one row; it must read as a change, never as a refusal.
    await h.env.DB.prepare(
      `UPDATE activities SET digest_json = json_set(digest_json, '$.athleteType', 'cat') WHERE id = ?`,
    )
      .bind(f)
      .run()
    await h.env.DB.prepare(
      'UPDATE users SET digest_bytes = (SELECT sum(length(CAST(digest_json AS BLOB))) FROM activities WHERE user_id = ?) WHERE id = ?',
    )
      .bind(mine.userId, mine.userId)
      .run()
    const start = await bytes(h, mine.userId)
    expect(start.counter).toBe(start.actual)
    // At the cap: changes that shrink or stay are admitted, and a growing one after them is refused.
    await h.env.DB.prepare('UPDATE users SET digest_bytes = ? WHERE id = ?')
      .bind(MAX_DIGEST_BYTES_PER_USER, mine.userId)
      .run()
    const res = await patch(h, mine.token, [
      change(b, 'ski', null), // hit, shrinks
      change(c, 'hike', 'ski'), // hit, same size
      change(a, null, 'other'), // refused: grows at the cap
      change(d, null, 'walk'), // revision miss
      change(e, 'walk', 'hike'), // label miss
      change(f, null, 'walk'), // the stored value is not a label: a miss
      change(theirs, null, 'walk'), // skipped
    ])
    expect(await res.json()).toEqual({
      applied: 2,
      skipped: 1,
      refused: 1,
      missed: [
        { id: d, revision: MODEL_REVISION - 1, athleteType: null },
        { id: e, revision: MODEL_REVISION, athleteType: null },
        { id: f, revision: MODEL_REVISION, athleteType: null },
      ],
    })
    const end = await bytes(h, mine.userId)
    const counter = await h.env.DB.prepare('SELECT digest_bytes AS n FROM users WHERE id = ?')
      .bind(mine.userId)
      .first<{ n: number }>()
    // The counter moved by exactly what the rows changed by.
    expect(counter!.n - MAX_DIGEST_BYTES_PER_USER).toBe(end.actual - start.actual)
    const theirSizes = await bytes(h, other.userId)
    expect(theirSizes.counter).toBe(theirSizes.actual)
    // Nothing is left marked.
    const leftover = await h.env.DB.prepare(
      `SELECT count(*) AS n FROM activities WHERE digest_json LIKE '%pending:%'`,
    ).first<{ n: number }>()
    expect(leftover!.n).toBe(0)
  })

  describe('the byte cap', () => {
    it('refuses a change that grows the digest at the cap, but still lets a clear through', async () => {
      const h = createHarness()
      const { token, userId } = await account(h)
      const id = await seed(h, userId)
      const other = await seed(h, userId, MODEL_REVISION, 'hike')
      await h.env.DB.prepare('UPDATE users SET digest_bytes = ? WHERE id = ?')
        .bind(MAX_DIGEST_BYTES_PER_USER - 1, userId)
        .run()

      const grow = await patch(h, token, [change(id, null, 'walk')])
      expect(await grow.json()).toEqual({ applied: 0, skipped: 0, refused: 1, missed: [] })
      expect((await stored(h, id)).athleteType).toBeUndefined()

      const shrink = await patch(h, token, [change(other, 'hike', null)])
      expect(await shrink.json()).toMatchObject({ applied: 1 })
      const row = await h.env.DB.prepare('SELECT digest_bytes AS n FROM users WHERE id = ?')
        .bind(userId)
        .first<{ n: number }>()
      expect(row!.n).toBeLessThan(MAX_DIGEST_BYTES_PER_USER - 1)
    })

    it('leaves the row and the counter together when the cap refuses part of a batch', async () => {
      const h = createHarness()
      const { token, userId } = await account(h)
      const ids = await Promise.all(Array.from({ length: 5 }, () => seed(h, userId)))
      const { counter } = await bytes(h, userId)
      // Room for about two labels: the rest are refused, and nothing drifts.
      await h.env.DB.prepare('UPDATE users SET digest_bytes = ? WHERE id = ?')
        .bind(MAX_DIGEST_BYTES_PER_USER - 45, userId)
        .run()
      const res = await patch(
        h,
        token,
        ids.map((id) => change(id, null, 'other')),
      )
      const body = (await res.json()) as { applied: number; refused: number }
      expect(body.applied + body.refused).toBe(5)
      expect(body.applied).toBeGreaterThan(0)
      expect(body.refused).toBeGreaterThan(0)
      const actual = (await bytes(h, userId)).actual
      const row = await h.env.DB.prepare('SELECT digest_bytes AS n FROM users WHERE id = ?')
        .bind(userId)
        .first<{ n: number }>()
      // The counter moved by exactly the bytes the applied rows grew.
      expect(row!.n - (MAX_DIGEST_BYTES_PER_USER - 45)).toBe(actual - counter)
    })

    it('refuses a change that grows the digest while the database is over its soft limit', async () => {
      const h = createHarness()
      const { token, userId } = await account(h)
      const id = await seed(h, userId)
      await h.env.DB.prepare(
        `INSERT INTO r2_storage_budget (id, lifetime_put_bytes, monthly_period, monthly_operations,
           monthly_put_bytes, d1_size_bytes) VALUES (1, 0, '2026-01', 0, 0, ?)`,
      )
        .bind(Number.MAX_SAFE_INTEGER)
        .run()
      const res = await patch(h, token, [change(id, null, 'walk')])
      expect(await res.json()).toMatchObject({ applied: 0, refused: 1 })
      expect((await stored(h, id)).athleteType).toBeUndefined()
    })
  })

  describe('against a rebuild of the same row', () => {
    /** Revision 5 is read beside the current 6, so a client can label it and a rebuild can replace it. */
    const exclusive = (revision: number): RevisionDeclaration => ({
      revision,
      kind: 'exclusive',
      adds: [],
      changes: [],
      affects: [],
    })
    const MIXED: readonly RevisionDeclaration[] = [
      ...[1, 2, 3, 4, 5].map(exclusive),
      {
        revision: 6,
        kind: 'mixable',
        adds: [],
        changes: [],
        affects: ['trend'],
        holdsBack: ['fitness'],
        bound: 'mixingStudy',
      },
    ]

    function rebuild(h: Harness, token: string) {
      return h.send({
        method: 'POST',
        path: '/api/activities',
        json: {
          digest: digestFixture({ id: `source-${seeded}`, startMs: START + seeded * 60_000 }),
          fileName: 'ride.fit',
          fileHash: HASH,
        },
        ...as(token),
      })
    }

    it('lets a label that lands mid-upgrade win: the upgrade is refused, neither is lost', async () => {
      await withRevisionTableAsync(MIXED, async () => {
        const first = createHarness()
        const { token, userId } = await account(first)
        const id = await seed(first, userId, MODEL_REVISION - 1)
        const before = await bytes(first, userId)
        // Just before the upgrade reserves its bytes, another request labels the row.
        const racing = racingDb(
          testEnv().DB,
          /^UPDATE users SET digest_bytes = digest_bytes \+ \?1/,
          async () => {
            const res = await patch(first, token, [change(id, null, 'hike', MODEL_REVISION - 1)])
            expect(await res.json()).toMatchObject({ applied: 1 })
          },
        )
        const h = createHarness({}, { DB: racing })
        const res = await rebuild(h, token)

        // The upgrade did not take: the answer still carries the old revision, which the updater retries.
        expect(await res.json()).toMatchObject({
          id,
          digest: { modelRevision: MODEL_REVISION - 1 },
        })
        const row = await stored(h, id)
        expect(row.athleteType).toBe('hike')
        expect(row.modelRevision).toBe(MODEL_REVISION - 1)
        const after = await bytes(h, userId)
        expect(after.counter).toBe(after.actual)
        expect(after.counter).toBeGreaterThan(before.counter)
      })
    })

    it('misses a label that arrives after the upgrade, reporting the new revision', async () => {
      await withRevisionTableAsync(MIXED, async () => {
        const h = createHarness()
        const { token, userId } = await account(h)
        const id = await seed(h, userId, MODEL_REVISION - 1)
        const upgraded = await rebuild(h, token)
        expect(await upgraded.json()).toMatchObject({ digest: { modelRevision: MODEL_REVISION } })

        const res = await patch(h, token, [change(id, null, 'hike', MODEL_REVISION - 1)])
        expect(await res.json()).toEqual({
          applied: 0,
          skipped: 0,
          refused: 0,
          missed: [{ id, revision: MODEL_REVISION, athleteType: null }],
        })
        expect((await stored(h, id)).athleteType).toBeUndefined()
        const sizes = await bytes(h, userId)
        expect(sizes.counter).toBe(sizes.actual)
      })
    })
  })
})
