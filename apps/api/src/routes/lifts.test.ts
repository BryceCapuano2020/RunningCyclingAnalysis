import { DAILY_LIMITS, LIFT_PAGE_SIZE } from '@rca/contract'
import { compareLiftSetKeys } from '@rca/core/lift'
import { describe, expect, it } from 'vitest'
import { testEnv } from '../test/harness.ts'
import { keyOf, liftAccount, liftSet } from '../test/lifts.ts'

interface Page {
  items: Record<string, unknown>[]
  next: string | null
  liftRevision: number
}

const body = async <T>(res: Response) => (await res.json()) as T

describe('lift sets: create, read, update, delete', () => {
  it('requires a session', async () => {
    const { h } = await liftAccount()
    expect((await h.send({ path: '/api/lifts' })).status).toBe(401)
    expect(
      (await h.send({ method: 'PUT', path: '/api/lifts', json: { sets: [liftSet()] } })).status,
    ).toBe(401)
    expect(
      (await h.send({ method: 'POST', path: '/api/lifts/delete', json: { keys: [] } })).status,
    ).toBe(401)
  })

  it('stores a set, reads it back as written, replaces it by key and deletes it', async () => {
    const { put, del, page } = await liftAccount()
    const full = liftSet(2, {
      time: '07:30',
      timePrecision: 'set',
      rpe: 8.5,
      warmup: true,
      loadKg: 62.5,
    })
    const plain = liftSet(1)
    expect((await put([full, plain])).status).toBe(200)
    expect((await body<Page>(await page())).items).toEqual([plain, full])

    const changed = liftSet(1, { reps: 8, loadKg: 90.25 })
    expect((await put([changed])).status).toBe(200)
    expect((await body<Page>(await page())).items).toEqual([changed, full])

    expect((await del([keyOf(plain)])).status).toBe(200)
    expect((await body<Page>(await page())).items).toEqual([full])
  })

  it('answers with the revision, which moves on every write and delete and not on a read', async () => {
    const { put, del, page, me } = await liftAccount()
    expect((await me()).liftRevision).toBe(0)
    expect(await body(await put([liftSet(1)]))).toEqual({ liftRevision: 1, skipped: [] })
    expect(await body(await put([liftSet(1, { reps: 6 })]))).toEqual({
      liftRevision: 2,
      skipped: [],
    })
    expect(await body(await del([keyOf(liftSet(1))]))).toEqual({ liftRevision: 3 })
    // A delete of a key with no set settles, and still answers.
    expect(await body(await del([keyOf(liftSet(1))]))).toEqual({ liftRevision: 4 })
    expect((await body<Page>(await page())).liftRevision).toBe(4)
    expect((await me()).liftRevision).toBe(4)
  })

  it('leaves libraryRevision alone', async () => {
    const { put, del, me } = await liftAccount()
    const before = (await me()).libraryRevision
    await put([liftSet(1), liftSet(2)])
    await del([keyOf(liftSet(1))])
    expect((await me()).libraryRevision).toBe(before)
  })

  it('pages in key-tuple order with an opaque cursor, set order 2 before 10', async () => {
    const { put, page } = await liftAccount()
    const sets = [
      liftSet(10),
      liftSet(2),
      liftSet(1, { exercise: 'back-squat-pause' }),
      liftSet(1, { date: '2026-03-01' }),
      liftSet(1, { equipment: 'smith' }),
    ]
    await put(sets)
    const first = await body<Page>(await page())
    expect(first.next).toBeNull()
    expect(first.items.map(keyOf)).toEqual([
      '2026-03-01.back-squat.barbell.1',
      '2026-03-02.back-squat.barbell.2',
      '2026-03-02.back-squat.barbell.10',
      '2026-03-02.back-squat.smith.1',
      '2026-03-02.back-squat-pause.barbell.1',
    ])
    // The stored order is the one core compares by, so a browser merging pages agrees with the server.
    const keys = first.items.map(keyOf)
    expect([...keys].reverse().sort(compareLiftSetKeys)).toEqual(keys)
  })

  it('walks a library larger than a page without a repeat or a gap', async () => {
    const { put, page } = await liftAccount()
    const total = LIFT_PAGE_SIZE + 3
    const sets = Array.from({ length: total }, (_, i) =>
      liftSet((i % 200) + 1, { exercise: `lift-${Math.floor(i / 200)}` }),
    )
    for (let from = 0; from < total; from += 500) await put(sets.slice(from, from + 500))
    const first = await body<Page>(await page())
    expect(first.items).toHaveLength(LIFT_PAGE_SIZE)
    expect(first.next).not.toBeNull()
    const second = await body<Page>(await page(first.next!))
    expect(second.next).toBeNull()
    const keys = [...first.items, ...second.items].map(keyOf)
    expect(new Set(keys).size).toBe(total)
    expect(keys).toHaveLength(total)
  }, 20_000)

  it('refuses a cursor that is not a position', async () => {
    const { page } = await liftAccount()
    for (const cursor of ['!!', 'bm90LWEta2V5', 'x'.repeat(300)]) {
      expect((await page(cursor)).status).toBe(400)
    }
  })

  it('refuses a cross-site read before charging it', async () => {
    const { h, cookies } = await liftAccount()
    const res = await h.send({
      path: '/api/lifts',
      cookies,
      headers: { 'Sec-Fetch-Site': 'cross-site' },
    })
    expect(res.status).toBe(403)
    const rows = await testEnv().DB.prepare('SELECT COUNT(*) AS n FROM daily_budget').first<{
      n: number
    }>()
    expect(rows?.n).toBe(0)
  })
})

describe('lift sets: two accounts', () => {
  it('shows one account only its own sets, and lets none replace or delete another own', async () => {
    const mine = await liftAccount('mine@example.com')
    const other = await liftAccount('other@example.com')
    const set = liftSet(1)
    await mine.put([set])
    expect((await body<Page>(await other.page())).items).toEqual([])

    // The other account writes and deletes the same key: it only touches its own row.
    await other.put([liftSet(1, { reps: 12 })])
    await other.del([keyOf(set)])
    expect((await body<Page>(await mine.page())).items).toEqual([set])
    expect((await mine.me()).liftRevision).toBe(1)

    await other.put([liftSet(1, { reps: 3 })])
    await mine.del([keyOf(set)])
    expect((await body<Page>(await other.page())).items).toEqual([liftSet(1, { reps: 3 })])
  })
})

describe('lift sets: refusals', () => {
  it('names the index of each refused set and writes none', async () => {
    const { put, page, me } = await liftAccount()
    const res = await put([
      liftSet(1),
      liftSet(2, { reps: 0 }),
      liftSet(3),
      liftSet(4, { rpe: 7.3 }),
    ])
    expect(res.status).toBe(400)
    const { error } = await body<{ error: { code: string; message: string } }>(res)
    expect(error.code).toBe('invalid_request')
    expect(error.message).toContain('sets.1')
    expect(error.message).toContain('sets.3')
    expect(error.message).not.toContain('sets.0')
    expect(error.message).not.toContain('sets.2')
    expect((await body<Page>(await page())).items).toEqual([])
    expect((await me()).liftRevision).toBe(0)
  })

  it('refuses a key named twice, with the index of the second', async () => {
    const { put, del } = await liftAccount()
    const res = await put([liftSet(1), liftSet(2), liftSet(1, { reps: 9 })])
    expect(res.status).toBe(400)
    expect((await body<{ error: { message: string } }>(res)).error.message).toContain('sets.2')
    const gone = await del([keyOf(liftSet(1)), keyOf(liftSet(2)), keyOf(liftSet(1))])
    expect(gone.status).toBe(400)
    expect((await body<{ error: { message: string } }>(gone)).error.message).toContain('keys.2')
  })

  it('refuses an empty write, an oversized one and a malformed key', async () => {
    const { put, del } = await liftAccount()
    expect((await put([])).status).toBe(400)
    expect((await put(Array.from({ length: 501 }, (_, i) => liftSet((i % 200) + 1)))).status).toBe(
      400,
    )
    const res = await del(['not-a-key'])
    expect(res.status).toBe(400)
    expect((await body<{ error: { message: string } }>(res)).error.message).toContain('keys.0')
  })

  /** An account whose user row vanishes just before its next batch, as a deletion finishing between requests. */
  async function accountGoneAtBatch() {
    let uid = ''
    const real = testEnv().DB
    const racing = new Proxy(real, {
      get(obj, prop) {
        const value: unknown = Reflect.get(obj, prop, obj)
        if (prop === 'batch' && uid !== '') {
          return async (statements: D1PreparedStatement[]) => {
            await real.prepare('DELETE FROM users WHERE id = ?').bind(uid).run()
            return real.batch(statements)
          }
        }
        return typeof value === 'function' ? value.bind(obj) : value
      },
    })
    const account = await liftAccount(undefined, { DB: racing })
    uid = (await account.me()).user.id
    return account
  }

  it('answers 401 to a delete whose RETURNING comes back empty, and gives the unit back', async () => {
    const { del } = await accountGoneAtBatch()
    expect((await del([keyOf(liftSet(1))])).status).toBe(401)
    const rows = await testEnv()
      .DB.prepare('SELECT COUNT(*) AS n FROM daily_budget')
      .first<{ n: number }>()
    expect(rows?.n).toBe(0)
  })

  it('answers 401 to a write for a user row that is gone, and stores nothing', async () => {
    const { put } = await accountGoneAtBatch()
    expect((await put([liftSet(1)])).status).toBe(401)
    const rows = await testEnv()
      .DB.prepare('SELECT COUNT(*) AS n FROM lift_sets')
      .first<{ n: number }>()
    expect(rows?.n).toBe(0)
  })
})

describe('insertOnly', () => {
  it('keeps stored sets and returns the keys it skipped', async () => {
    const { put, page } = await liftAccount()
    await put([liftSet(1), liftSet(2)])
    const res = await put([liftSet(1, { reps: 50 }), liftSet(2, { reps: 50 }), liftSet(3)], true)
    expect(await body(res)).toEqual({
      liftRevision: 2,
      skipped: [keyOf(liftSet(1)), keyOf(liftSet(2))],
    })
    const items = (await body<Page>(await page())).items
    expect(items.map((s) => s.reps)).toEqual([5, 5, 5])
  })
})

describe('the daily budgets', () => {
  it('meters reads and writes apart, and takes nothing for a write refused as invalid', async () => {
    const { put, page } = await liftAccount()
    await put([liftSet(1)])
    await page()
    await put([liftSet(1, { reps: 0 })])
    const used = async (action: string) =>
      (
        await testEnv()
          .DB.prepare('SELECT used FROM daily_budget WHERE action = ?')
          .bind(action)
          .first<{ used: number }>()
      )?.used
    expect(await used('liftWrite')).toBe(1)
    expect(await used('liftRead')).toBe(1)
    expect(await used('listRows')).toBe(1)
  })

  it('answers 429 over the write budget', async () => {
    const { put, me } = await liftAccount()
    const uid = (await me()).user.id
    await testEnv()
      .DB.prepare(
        `INSERT INTO daily_budget (user_id, day, action, used) VALUES (?, '2026-01-15', 'liftWrite', ?)`,
      )
      .bind(uid, DAILY_LIMITS.liftWrite)
      .run()
    expect((await put([liftSet(1)])).status).toBe(429)
  })
})
