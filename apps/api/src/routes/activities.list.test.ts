import { describe, expect, it, vi } from 'vitest'
import {
  ActivityPageSchema,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_BODY_BYTES,
  MAX_PAGE_DIGEST_BYTES,
  MAX_PAGE_SIZE,
} from '@rca/contract'
import { createHarness, digestFixture, START, testEnv, type Harness } from '../test/harness.ts'

/** Characters that break a hand-built JSON string, or a script that embeds one. */
const HOSTILE = 'He said "hi" \\ </script><!--     end'

/** Bound parameters one D1 statement may carry. */
const D1_BOUND_PARAMETERS = 100

function as(token: string) {
  return { cookies: { rca_session: token } }
}

async function userId(h: Harness, token: string): Promise<string> {
  const me = (await (await h.send({ path: '/api/me', ...as(token) })).json()) as {
    user: { id: string }
  }
  return me.user.id
}

interface Listed {
  id: string
  fileName: string
  digest: Record<string, unknown>
}
interface ListedPage {
  items: Listed[]
  nextCursor: string | null
  unreadable?: number
}

async function listText(h: Harness, token: string, query = ''): Promise<string> {
  const res = await h.send({ path: `/api/activities${query}`, ...as(token) })
  expect(res.status).toBe(200)
  return res.text()
}

async function listPage(h: Harness, token: string, query = ''): Promise<ListedPage> {
  return JSON.parse(await listText(h, token, query)) as ListedPage
}

/** Stores a row exactly as given, bypassing the create route and its checks. */
async function insertRow(
  h: Harness,
  uid: string,
  row: { id: string; digestJson: string; createdAt: number; fileName?: string },
): Promise<void> {
  await h.env.DB.prepare(
    `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
       digest_json, file_name, file_hash, created_at)
     VALUES (?, ?, ?, 'ride', ?, 'stored', 1, ?, ?, 'h', ?)`,
  )
    .bind(
      row.id,
      uid,
      `key-${row.id}`,
      row.createdAt,
      row.digestJson,
      row.fileName ?? 'ride.fit',
      row.createdAt,
    )
    .run()
}

/** Stores `count` rows with one digest text, newest last, in a single statement. */
async function seedRows(
  h: Harness,
  uid: string,
  count: number,
  digestJson: string,
  fileName = 'ride.fit',
) {
  await h.env.DB.prepare(
    `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
     INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
       digest_json, file_name, file_hash, created_at)
     SELECT 'row-' || printf('%05d', i), ?, 'key-' || i, 'ride', i, 'seeded', 1, ?, ?,
       'h', ? + i FROM n`,
  )
    .bind(count, uid, digestJson, fileName, START)
    .run()
}

/** Wraps a D1 binding and records the most parameters any one statement was bound with. */
function parameterCounting(target: D1Database): { db: D1Database; most(): number } {
  let most = 0
  const db = new Proxy(target, {
    get(obj, prop) {
      const value: unknown = Reflect.get(obj, prop, obj)
      if (prop !== 'prepare' || typeof value !== 'function') {
        return typeof value === 'function' ? value.bind(obj) : value
      }
      return (query: string) => {
        const statement = obj.prepare(query)
        return new Proxy(statement, {
          get(inner, name) {
            const member: unknown = Reflect.get(inner, name, inner)
            if (name !== 'bind' || typeof member !== 'function') {
              return typeof member === 'function' ? member.bind(inner) : member
            }
            return (...values: unknown[]) => {
              most = Math.max(most, values.length)
              return inner.bind(...values)
            }
          },
        })
      }
    },
  })
  return { db, most: () => most }
}

const FIXTURE_TEXT = JSON.stringify(digestFixture())

describe('GET /api/activities page size', () => {
  it('defaults to a page of 90 and rejects limits outside 1 to 90', async () => {
    expect(DEFAULT_PAGE_SIZE).toBe(MAX_PAGE_SIZE)
    const h = createHarness()
    const token = await h.signIn()
    await seedRows(h, await userId(h, token), MAX_PAGE_SIZE + 1, FIXTURE_TEXT)

    const defaultPage = await listPage(h, token)
    expect(defaultPage.items).toHaveLength(90)
    expect(defaultPage.nextCursor).not.toBeNull()
    expect((await listPage(h, token, '?limit=90')).items).toHaveLength(90)
    for (const limit of ['0', '91', '1001', 'abc', '1.5']) {
      const res = await h.send({ path: `/api/activities?limit=${limit}`, ...as(token) })
      expect(res.status, limit).toBe(400)
    }
  })

  it('binds at most the 100 parameters D1 allows when it reads a full page', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await seedRows(h, await userId(h, token), MAX_PAGE_SIZE + 1, FIXTURE_TEXT)

    const counted = parameterCounting(testEnv().DB)
    const reader = createHarness({}, { DB: counted.db })
    const page = await (
      await reader.send({ path: `/api/activities?limit=${MAX_PAGE_SIZE}`, ...as(token) })
    ).json()
    expect((page as ListedPage).items).toHaveLength(MAX_PAGE_SIZE)
    expect(counted.most()).toBe(MAX_PAGE_SIZE + 1)
    expect(counted.most()).toBeLessThanOrEqual(D1_BOUND_PARAMETERS)
  })

  it('lists 1,915 activities in 22 pages', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await seedRows(h, await userId(h, token), 1915, FIXTURE_TEXT)

    const ids: string[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const cursorPart: string = cursor === null ? '' : `&cursor=${cursor}`
      const page = await listPage(h, token, `?limit=${MAX_PAGE_SIZE}${cursorPart}`)
      ids.push(...page.items.map((item) => item.id))
      cursor = page.nextCursor
      pages += 1
    } while (cursor !== null)
    expect(pages).toBe(22)
    expect(new Set(ids).size).toBe(1915)
  })

  it('keeps a full page of long names inside the page body limit', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await seedRows(h, await userId(h, token), MAX_PAGE_SIZE, FIXTURE_TEXT, 'é'.repeat(255))
    const text = await listText(h, token)
    const digestBytes = new TextEncoder().encode(FIXTURE_TEXT).byteLength * MAX_PAGE_SIZE
    const bodyBytes = new TextEncoder().encode(text).byteLength
    expect(JSON.parse(text)).toHaveProperty('items.length', MAX_PAGE_SIZE)
    // Everything but the digests is envelope, which carries the longest file names. The body limit
    // leaves this much room for it beside a full digest budget.
    expect(bodyBytes - digestBytes).toBeLessThan(MAX_PAGE_BODY_BYTES - MAX_PAGE_DIGEST_BYTES)
  })
})

describe('GET /api/activities digest text', () => {
  it('sends a stored digest as it is, with the right content type and the page shape', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const stored = JSON.parse(FIXTURE_TEXT) as Record<string, unknown>
    stored.futureField = { kept: ['as', 'stored'] }
    // Indented, with a field the schema does not know: any parse and stringify would change it.
    const digestJson = JSON.stringify(stored, null, 2)
    await insertRow(h, await userId(h, token), { id: 'verbatim', digestJson, createdAt: START })

    const res = await h.send({ path: '/api/activities', ...as(token) })
    expect(res.headers.get('content-type')).toBe('application/json')
    const text = await res.text()
    expect(text).toContain(digestJson)
    expect(ActivityPageSchema.parse(JSON.parse(text)).items.map((item) => item.id)).toEqual([
      'verbatim',
    ])
  })

  it('leaves the shape of a digest to the client, so JSON that is not a digest is passed on', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    await insertRow(h, uid, { id: 'odd', digestJson: '{"version":1}', createdAt: START })
    await insertRow(h, uid, { id: 'null', digestJson: 'null', createdAt: START + 1 })

    const page = await listPage(h, token)
    expect(page.items.map((item) => [item.id, item.digest])).toEqual([
      ['null', null],
      ['odd', { version: 1 }],
    ])
    expect(page.unreadable).toBeUndefined()
  })

  it('round-trips quotes, backslashes, script tags and line separators in digest and envelope', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    const literal = JSON.stringify(digestFixture({ name: HOSTILE }), null, 1)
    // The same digest with its awkward characters written as escapes, as another encoder could.
    const escaped = literal
      .replaceAll(' ', '\\u2028')
      .replaceAll(' ', '\\u2029')
      .replaceAll('<', '\\u003c')
    expect(escaped).not.toBe(literal)
    await insertRow(h, uid, {
      id: 'literal',
      digestJson: literal,
      createdAt: START,
      fileName: HOSTILE,
    })
    await insertRow(h, uid, {
      id: 'escaped',
      digestJson: escaped,
      createdAt: START + 1,
      fileName: HOSTILE,
    })

    const text = await listText(h, token)
    expect(text).toContain(literal)
    expect(text).toContain(escaped)
    const page = ActivityPageSchema.parse(JSON.parse(text))
    expect(page.items.map((item) => [item.id, item.digest.name, item.fileName])).toEqual([
      ['escaped', HOSTILE, HOSTILE],
      ['literal', HOSTILE, HOSTILE],
    ])
  })
})

describe('GET /api/activities unreadable digests', () => {
  it('skips a row that is not JSON, counts it, and never splices its text into the body', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    await insertRow(h, uid, { id: 'good', digestJson: FIXTURE_TEXT, createdAt: START })
    const breakouts = [
      'not json',
      '',
      '{"a":1},"injected":true',
      '}],"nextCursor":"forged","items":[{',
      '{"a":1} {"b":2}',
      '﻿{"a":1}',
      "{'a':1}",
      '{"a":NaN}',
    ]
    for (const [index, digestJson] of breakouts.entries()) {
      await insertRow(h, uid, { id: `bad-${index}`, digestJson, createdAt: START + 1 + index })
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const text = await listText(h, token)
    const logged = warn.mock.calls.flat().join(' ')
    warn.mockRestore()
    const page = JSON.parse(text) as ListedPage
    expect(page.items.map((item) => item.id)).toEqual(['good'])
    expect(page.unreadable).toBe(breakouts.length)
    expect(page.nextCursor).toBeNull()
    expect(text).not.toContain('injected')
    expect(text).not.toContain('forged')
    expect(logged).toContain('"activityId":"bad-0"')
    expect(logged).not.toContain('injected')
  })
})
