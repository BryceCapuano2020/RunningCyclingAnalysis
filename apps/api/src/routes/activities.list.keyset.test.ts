import {
  DAILY_LIMITS,
  DEFAULT_PAGE_SIZE,
  LIST_ROWS_LIMIT_MESSAGE,
  LIST_ROWS_PER_DAY,
} from '@rca/contract'
import { describe, expect, it } from 'vitest'
import { utcDay } from '../budget.ts'
import { encodeCursor } from '../cursor.ts'
import { createHarness, resetTestEnv, START, type Harness } from '../test/harness.ts'

/** The stateless keyset cursor and the list meter (design: .claude/stage-d/D3_DESIGN.md, section 2). */

interface Seed {
  id: string
  createdAt: number
}

const asUser = (token: string) => ({ cookies: { rca_session: token } })

async function userIdOf(h: Harness, email: string): Promise<string> {
  const row = await h.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string }>()
  if (!row) throw new Error('no such user')
  return row.id
}

function insertStatement(h: Harness, userId: string, row: Seed): D1PreparedStatement {
  return h.env.DB.prepare(
    `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
       digest_json, file_name, file_hash, created_at)
     VALUES (?, ?, ?, 'run', ?, 'n', 1, '{"name":"n"}', 'f.fit', 'h', ?)`,
  ).bind(row.id, userId, row.id, row.createdAt, row.createdAt)
}

async function seed(h: Harness, userId: string, rows: Seed[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 50) {
    await h.env.DB.batch(rows.slice(i, i + 50).map((row) => insertStatement(h, userId, row)))
  }
}

async function remove(h: Harness, id: string): Promise<void> {
  await h.env.DB.prepare('DELETE FROM activities WHERE id = ?').bind(id).run()
}

interface PageResult {
  status: number
  ids: string[]
  next: string | null
  body: Record<string, unknown>
}

async function page(h: Harness, token: string, query: string): Promise<PageResult> {
  const res = await h.send({ path: `/api/activities${query}`, ...asUser(token) })
  const body = (await res.json()) as Record<string, unknown>
  const items = (body.items as { id: string }[] | undefined) ?? []
  return {
    status: res.status,
    ids: items.map((item) => item.id),
    next: (body.nextCursor as string | null | undefined) ?? null,
    body,
  }
}

/** Walks a listing page by page, calling `between` after each page with the page's index. */
async function walk(
  h: Harness,
  token: string,
  limit: number,
  between: (pageIndex: number, got: string[]) => Promise<void> = async () => {},
): Promise<string[]> {
  const seen: string[] = []
  let cursor: string | null = null
  for (let index = 0; ; index += 1) {
    const result: PageResult = await page(
      h,
      token,
      `?limit=${limit}${cursor === null ? '' : `&cursor=${cursor}`}`,
    )
    expect(result.status).toBe(200)
    seen.push(...result.ids)
    cursor = result.next
    if (cursor === null) return seen
    await between(index, seen)
  }
}

/** Newest first, ties by id descending: the order the API promises. */
function inListOrder(rows: Seed[]): string[] {
  return [...rows]
    .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    .map((row) => row.id)
}

const decodeCursorText = (cursor: string) => Buffer.from(cursor, 'base64url').toString('utf8')

const label = (n: number) => `act-${String(n).padStart(4, '0')}`
const T = START

function library(count: number, tieEvery = 4): Seed[] {
  // Every `tieEvery` rows share a created_at, so ties cross page boundaries.
  return Array.from({ length: count }, (_, n) => ({
    id: label(n),
    createdAt: T + Math.floor(n / tieEvery) * 1000,
  }))
}

async function setup(count = 40) {
  const h = createHarness()
  const token = await h.signIn('rider@example.test')
  const uid = await userIdOf(h, 'rider@example.test')
  const rows = library(count)
  await seed(h, uid, rows)
  return { h, token, uid, rows }
}

describe('the keyset cursor', () => {
  it.each([1, 3, 7, 41, 90])(
    'walks the library newest first with ties by id, each row once, at page size %i',
    async (limit) => {
      const { h, token, rows } = await setup(41)
      expect(await walk(h, token, limit)).toEqual(inListOrder(rows))
    },
  )

  it('does not move when rows newer than the cursor are inserted mid-walk', async () => {
    const { h, token, uid, rows } = await setup()
    const newer = Array.from({ length: 5 }, (_, n) => ({
      id: `new-${n}`,
      createdAt: T + 9_000_000 + n,
    }))
    const seen = await walk(h, token, 6, async (index) => {
      if (index === 1) await seed(h, uid, newer)
    })
    expect(seen).toEqual(inListOrder(rows))
  })

  it('shows rows inserted behind the cursor, in order, and never twice', async () => {
    const { h, token, uid, rows } = await setup()
    const older = [
      { id: 'old-a', createdAt: T - 5000 },
      { id: 'old-b', createdAt: T - 1 },
      { id: 'old-c', createdAt: T + 3500 },
    ]
    const seen = await walk(h, token, 6, async (index) => {
      if (index === 0) await seed(h, uid, older)
    })
    expect(seen).toEqual(inListOrder([...rows, ...older]))
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('treats a row tied with the cursor by created_at by its id: a smaller id is still ahead, a greater one is behind', async () => {
    const { h, token, uid, rows } = await setup(12)
    const first = await page(h, token, '?limit=2')
    const edge = rows.find((row) => row.id === first.ids.at(-1))
    if (!edge) throw new Error('no edge row')
    const ahead = { id: 'aaa-ahead', createdAt: edge.createdAt }
    const behind = { id: 'zzz-behind', createdAt: edge.createdAt }
    await seed(h, uid, [ahead, behind])
    const rest: string[] = []
    let cursor = first.next
    while (cursor !== null) {
      const next = await page(h, token, `?limit=2&cursor=${cursor}`)
      rest.push(...next.ids)
      cursor = next.next
    }
    expect(rest).toContain(ahead.id)
    expect(rest).not.toContain(behind.id)
    expect(rest).toEqual(inListOrder([...rows.filter((r) => !first.ids.includes(r.id)), ahead]))
  })

  it('skips nothing and repeats nothing when rows already returned are deleted', async () => {
    const { h, token, rows } = await setup()
    const seen = await walk(h, token, 5, async (index, got) => {
      if (index === 1) for (const id of got.slice(0, 4)) await remove(h, id)
    })
    expect(seen).toEqual(inListOrder(rows))
  })

  it('continues from the same position when the row the cursor points at is deleted', async () => {
    const { h, token, rows } = await setup()
    const seen = await walk(h, token, 5, async (index, got) => {
      if (index === 1) await remove(h, got.at(-1) ?? '')
    })
    expect(seen).toEqual(inListOrder(rows))
  })

  it('does not show a row deleted before it is reached', async () => {
    const { h, token, rows } = await setup()
    const ordered = inListOrder(rows)
    const doomed = [ordered[12] ?? '', ordered[13] ?? '', ordered.at(-1) ?? '']
    const seen = await walk(h, token, 5, async (index) => {
      if (index === 0) for (const id of doomed) await remove(h, id)
    })
    expect(seen).toEqual(ordered.filter((id) => !doomed.includes(id)))
  })

  // One test for each seed, so a loaded machine does not run six walks against one timeout.
  it.each([1, 2, 3, 4, 5, 6])(
    'shows every row present for the whole walk exactly once, in order, under random inserts and deletes (seed %i)',
    async (randomSeed) => {
      await resetTestEnv()
      const { h, token, uid, rows } = await setup(60)
      let state = randomSeed * 7919
      const random = (n: number) => {
        state = (state * 1103515245 + 12345) & 0x7fffffff
        return state % n
      }
      const alive = new Map(rows.map((row) => [row.id, row]))
      const stable = new Set(rows.map((row) => row.id))
      let counter = 0
      const seen = await walk(h, token, 4 + (randomSeed % 5), async () => {
        for (let step = 0; step < 3; step += 1) {
          if (random(2) === 0) {
            const row = {
              id: `rnd-${randomSeed}-${counter}`,
              createdAt: T - 2000 + random(18) * 1000,
            }
            counter += 1
            await seed(h, uid, [row])
            alive.set(row.id, row)
          } else {
            const victim = [...alive.keys()][random(alive.size)]
            if (victim !== undefined) {
              await remove(h, victim)
              alive.delete(victim)
              stable.delete(victim)
            }
          }
        }
      })
      const position = new Map(seen.map((id, i) => [id, i]))
      expect(new Set(seen).size, `seed ${randomSeed}: no repeats`).toBe(seen.length)
      for (const id of stable) expect(position.has(id), `seed ${randomSeed}: ${id}`).toBe(true)
      const byId = new Map<string, Seed>([...rows, ...alive.values()].map((row) => [row.id, row]))
      const order = seen.map((id) => byId.get(id)).filter((row): row is Seed => row !== undefined)
      expect(seen, `seed ${randomSeed}: order`).toEqual(inListOrder(order))
    },
  )

  it('accepts a cursor written by the previous Worker, byte for byte', async () => {
    // base64url("1768478400000:act-0003"), the text the previous Worker issued and the web client
    // sends back. Written out, not built by encodeCursor, so a change to the encoding fails here.
    const legacy = 'MTc2ODQ3ODQwMDAwMDphY3QtMDAwMw'
    const { h, token } = await setup(12)
    const rows = library(12).map((row): Seed => ({
      id: row.id,
      createdAt: row.createdAt - T + 1768478400000,
    }))
    await h.env.DB.prepare('UPDATE activities SET created_at = created_at - ? + 1768478400000')
      .bind(T)
      .run()
    const res = await page(h, token, `?limit=90&cursor=${legacy}`)
    expect(res.status).toBe(200)
    const expected = inListOrder(
      rows.filter(
        (row) =>
          row.createdAt < 1768478400000 || (row.createdAt === 1768478400000 && row.id < 'act-0003'),
      ),
    )
    expect(res.ids).toEqual(expected)
    expect(res.ids.length).toBeGreaterThan(0)
    expect(decodeCursorText(legacy)).toBe('1768478400000:act-0003')
    expect(encodeCursor({ createdAt: 1768478400000, id: 'act-0003' })).toBe(legacy)
  })

  it('rejects a cursor that is not a position: a huge number, a long id, a bad shape', async () => {
    const { h, token, uid } = await setup(3)
    const bad = [
      encodeCursor({ createdAt: Number.MAX_SAFE_INTEGER + 2, id: 'x' }),
      encodeCursor({ createdAt: 1, id: 'x'.repeat(65) }),
      'not+valid',
      Buffer.from('abc').toString('base64url'),
    ]
    for (const cursor of bad) {
      const res = await page(h, token, `?cursor=${cursor}`)
      expect(res.status, cursor).toBe(400)
    }
    expect(await usedOf(h, uid, 'listRows')).toBe(0)
  })
})

async function usedOf(h: Harness, userId: string, action: string): Promise<number> {
  const row = await h.env.DB.prepare(
    'SELECT coalesce(sum(used), 0) AS n FROM daily_budget WHERE user_id = ? AND action = ?',
  )
    .bind(userId, action)
    .first<{ n: number }>()
  return row?.n ?? 0
}

async function setUsed(h: Harness, userId: string, action: string, used: number): Promise<void> {
  await h.env.DB.prepare(
    `INSERT INTO daily_budget (user_id, day, action, used) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, day, action) DO UPDATE SET used = excluded.used`,
  )
    .bind(userId, utcDay(START), action, used)
    .run()
}

describe('the list meter', () => {
  it('charges one read unit per library load and each page at least a default page of rows', async () => {
    const { h, token, uid } = await setup(12)
    await walk(h, token, 5)
    expect(await usedOf(h, uid, 'read')).toBe(1)
    expect(await usedOf(h, uid, 'listRows')).toBe(DEFAULT_PAGE_SIZE * 3)
    await page(h, token, '')
    expect(await usedOf(h, uid, 'listRows')).toBe(DEFAULT_PAGE_SIZE * 4)
    expect(await usedOf(h, uid, 'read')).toBe(2)
  })

  it('does not make a request cheaper by asking for one row at a time', async () => {
    const { h, token, uid } = await setup(6)
    await walk(h, token, 1)
    expect(await usedOf(h, uid, 'listRows')).toBe(DEFAULT_PAGE_SIZE * 6)
  })

  it('charges a page the full default even when the page is cut short by the digest byte budget', async () => {
    const { h, token, uid } = await setup(3)
    // Three rows of about 300 KiB each cannot share a 512 KiB page, so each page holds one row.
    const big = JSON.stringify({ name: 'x'.repeat(300 * 1024) })
    await h.env.DB.prepare('UPDATE activities SET digest_json = ?').bind(big).run()
    const first = await page(h, token, '')
    expect(first.ids).toHaveLength(1)
    expect(await usedOf(h, uid, 'listRows')).toBe(DEFAULT_PAGE_SIZE)
  })

  it('lets many tabs list at once without spending more than one read unit each', async () => {
    const { h, token, uid, rows } = await setup(30)
    const walks = await Promise.all([walk(h, token, 4), walk(h, token, 4), walk(h, token, 4)])
    for (const seen of walks) expect(seen).toEqual(inListOrder(rows))
    expect(await usedOf(h, uid, 'read')).toBe(3)
  })

  it('does not let a replayed cursor read for free: every replay is charged its page', async () => {
    const { h, token, uid } = await setup(12)
    const first = await page(h, token, '?limit=4')
    const before = await usedOf(h, uid, 'listRows')
    const a = await page(h, token, `?limit=4&cursor=${first.next}`)
    const b = await page(h, token, `?limit=4&cursor=${first.next}`)
    expect(b.ids).toEqual(a.ids)
    expect(await usedOf(h, uid, 'listRows')).toBe(before + 2 * DEFAULT_PAGE_SIZE)
    expect(await usedOf(h, uid, 'read')).toBe(1)

    await setUsed(h, uid, 'listRows', LIST_ROWS_PER_DAY - 3)
    const refused = await page(h, token, `?limit=4&cursor=${first.next}`)
    expect(refused.status).toBe(429)
    // The rows meter has its own words: the library-load limit (100 a day) is not what was reached.
    expect(refused.body).toMatchObject({
      error: { code: 'daily_limit', message: LIST_ROWS_LIMIT_MESSAGE },
    })
  })

  it('gives the read unit back when the rows allowance refuses a new load', async () => {
    const { h, token, uid } = await setup(5)
    await setUsed(h, uid, 'listRows', LIST_ROWS_PER_DAY - 1)
    const refused = await page(h, token, '')
    expect(refused.status).toBe(429)
    expect(await usedOf(h, uid, 'read')).toBe(0)
    expect(await usedOf(h, uid, 'listRows')).toBe(LIST_ROWS_PER_DAY - 1)
  })

  it('still refuses a new load when the read units are spent, but serves continuations', async () => {
    const { h, token, uid } = await setup(9)
    const first = await page(h, token, '?limit=3')
    await setUsed(h, uid, 'read', DAILY_LIMITS.read)
    expect((await page(h, token, '?limit=3')).status).toBe(429)
    expect((await page(h, token, `?limit=3&cursor=${first.next}`)).status).toBe(200)
  })

  it("treats a forged cursor as a position in the caller's own list, with no read unit", async () => {
    const { h, token, uid, rows } = await setup(12)
    const forged = encodeCursor({ createdAt: T + 1500, id: 'zzz' })
    const res = await page(h, token, `?limit=90&cursor=${forged}`)
    expect(res.status).toBe(200)
    expect(res.ids).toEqual(
      inListOrder(
        rows.filter(
          (row) => row.createdAt < T + 1500 || (row.createdAt === T + 1500 && row.id < 'zzz'),
        ),
      ),
    )
    expect(await usedOf(h, uid, 'read')).toBe(0)
  })

  it("never shows another user's rows, even with that user's cursor", async () => {
    const { h, token } = await setup(12)
    const bob = await h.signIn('bob@example.test')
    const bobId = await userIdOf(h, 'bob@example.test')
    await seed(h, bobId, [
      { id: 'bob-1', createdAt: T + 100 },
      { id: 'bob-2', createdAt: T + 200 },
    ])
    const alice = await page(h, token, '?limit=3')
    const viaBob = await page(h, bob, `?limit=3&cursor=${alice.next}`)
    expect(viaBob.status).toBe(200)
    expect(viaBob.ids.every((id) => id.startsWith('bob-'))).toBe(true)
    expect(viaBob.ids).toEqual(['bob-2', 'bob-1'])
  })

  it('no longer reads or writes the legacy cursor slot', async () => {
    const { h, token, uid } = await setup(12)
    await walk(h, token, 4)
    const row = await h.env.DB.prepare('SELECT list_cursor FROM users WHERE id = ?')
      .bind(uid)
      .first<{ list_cursor: string | null }>()
    expect(row?.list_cursor).toBeNull()
    await h.env.DB.prepare('UPDATE users SET list_cursor = ? WHERE id = ?')
      .bind('stale-slot-value', uid)
      .run()
    const first = await page(h, token, '?limit=4')
    const second = await page(h, token, `?limit=4&cursor=${first.next}`)
    expect(second.status).toBe(200)
    const after = await h.env.DB.prepare('SELECT list_cursor FROM users WHERE id = ?')
      .bind(uid)
      .first<{ list_cursor: string | null }>()
    expect(after?.list_cursor).toBe('stale-slot-value')
  })
})
