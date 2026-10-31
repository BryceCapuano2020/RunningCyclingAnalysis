import { expect } from 'vitest'
import { createHarness, START, type Harness } from './harness.ts'

/** Helpers for the keyset cursor tests (design: .claude/stage-d/D3_DESIGN.md, section 2). */

export interface Seed {
  id: string
  createdAt: number
}

export const asUser = (token: string) => ({ cookies: { rca_session: token } })

export async function userIdOf(h: Harness, email: string): Promise<string> {
  const row = await h.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string }>()
  if (!row) throw new Error('no such user')
  return row.id
}

export function insertStatement(h: Harness, userId: string, row: Seed): D1PreparedStatement {
  return h.env.DB.prepare(
    `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
       digest_json, file_name, file_hash, created_at)
     VALUES (?, ?, ?, 'run', ?, 'n', 1, '{"name":"n"}', 'f.fit', 'h', ?)`,
  ).bind(row.id, userId, row.id, row.createdAt, row.createdAt)
}

export async function seed(h: Harness, userId: string, rows: Seed[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 50) {
    await h.env.DB.batch(rows.slice(i, i + 50).map((row) => insertStatement(h, userId, row)))
  }
}

export async function remove(h: Harness, id: string): Promise<void> {
  await h.env.DB.prepare('DELETE FROM activities WHERE id = ?').bind(id).run()
}

export interface PageResult {
  status: number
  ids: string[]
  next: string | null
  body: Record<string, unknown>
}

export async function page(h: Harness, token: string, query: string): Promise<PageResult> {
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
export async function walk(
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
export function inListOrder(rows: Seed[]): string[] {
  return [...rows]
    .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    .map((row) => row.id)
}

export const decodeCursorText = (cursor: string) =>
  Buffer.from(cursor, 'base64url').toString('utf8')

export const label = (n: number) => `act-${String(n).padStart(4, '0')}`
export const T = START

export function library(count: number, tieEvery = 4): Seed[] {
  // Every `tieEvery` rows share a created_at, so ties cross page boundaries.
  return Array.from({ length: count }, (_, n) => ({
    id: label(n),
    createdAt: T + Math.floor(n / tieEvery) * 1000,
  }))
}

export async function setup(count = 40) {
  const h = createHarness()
  const token = await h.signIn('rider@example.test')
  const uid = await userIdOf(h, 'rider@example.test')
  const rows = library(count)
  await seed(h, uid, rows)
  return { h, token, uid, rows }
}
