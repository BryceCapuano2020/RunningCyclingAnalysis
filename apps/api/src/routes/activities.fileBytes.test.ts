import { describe, expect, it } from 'vitest'
import { MAX_STORED_BYTES_PER_USER } from '@rca/contract'
import {
  countingDb,
  createHarness,
  digestFixture,
  START,
  testEnv,
  type Harness,
} from '../test/harness.ts'
import { sha256Hex } from '../util.ts'

const CONTENT = new TextEncoder().encode('0123 fake FIT bytes')
const SIZE = CONTENT.byteLength
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

async function setKeepFiles(h: Harness, token: string, keepFiles: boolean): Promise<void> {
  const res = await h.send({
    method: 'PUT',
    path: '/api/profile',
    json: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles },
    ...as(token),
  })
  expect(res.status).toBe(200)
}

/** A new activity whose original is CONTENT; each call needs its own start time. */
async function createActivity(h: Harness, token: string, startMs = START): Promise<string> {
  const res = await h.send({
    method: 'POST',
    path: '/api/activities',
    json: { digest: digestFixture({ startMs }), fileName: 'ride.fit', fileHash: HASH_OF_CONTENT },
    ...as(token),
  })
  expect(res.status).toBe(201)
  return ((await res.json()) as { id: string }).id
}

function upload(h: Harness, token: string, id: string, body: Uint8Array = CONTENT) {
  return h.app.request(
    `/api/activities/${id}/file`,
    {
      method: 'PUT',
      headers: {
        'X-RCA-Client': 'web',
        cookie: `rca_session=${token}`,
        'content-length': String(body.byteLength),
      },
      body,
      duplex: 'half',
    } as RequestInit,
    h.env,
  )
}

/** The user's counter beside the bytes their rows hold. They must always agree. */
async function stored(h: Harness, uid: string): Promise<{ counter: number; actual: number }> {
  const row = await h.env.DB.prepare(
    `SELECT file_bytes AS counter,
       (SELECT coalesce(sum(file_size), 0) FROM activities WHERE user_id = users.id) AS actual
     FROM users WHERE id = ?`,
  )
    .bind(uid)
    .first<{ counter: number; actual: number }>()
  if (!row) throw new Error('user row missing')
  return row
}

const bytes = (n: number) => ({ counter: n, actual: n })

describe('the stored-file counter', () => {
  it('moves with an upload, ignores a repeat, and gives the bytes back on delete', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    await setKeepFiles(h, token, true)
    const first = await createActivity(h, token, START)
    const second = await createActivity(h, token, START + 60_000)
    expect(await stored(h, uid)).toEqual(bytes(0))

    expect((await upload(h, token, first)).status).toBe(200)
    expect(await stored(h, uid)).toEqual(bytes(SIZE))
    expect((await upload(h, token, first)).status).toBe(200)
    expect(await stored(h, uid)).toEqual(bytes(SIZE))
    expect((await upload(h, token, second)).status).toBe(200)
    expect(await stored(h, uid)).toEqual(bytes(2 * SIZE))

    const removed = await h.send({
      method: 'DELETE',
      path: `/api/activities/${first}`,
      ...as(token),
    })
    expect(removed.status).toBe(204)
    expect(await stored(h, uid)).toEqual(bytes(SIZE))
  })

  it("gives a failed upload's reservation back", async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    await setKeepFiles(h, token, true)
    const id = await createActivity(h, token)

    const mismatch = await upload(h, token, id, new TextEncoder().encode('0123 other FIT bytes'))
    expect(mismatch.status).toBe(422)
    expect(await stored(h, uid)).toEqual(bytes(0))
  })

  it('goes to zero when original files are turned off', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    await setKeepFiles(h, token, true)
    expect((await upload(h, token, await createActivity(h, token))).status).toBe(200)
    expect(await stored(h, uid)).toEqual(bytes(SIZE))

    await setKeepFiles(h, token, false)
    expect(await stored(h, uid)).toEqual(bytes(0))
  })

  it('leaves nothing behind when the account is deleted with its files', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    await setKeepFiles(h, token, true)
    expect((await upload(h, token, await createActivity(h, token))).status).toBe(200)

    const deleted = await h.send({ method: 'DELETE', path: '/api/me', ...as(token) })

    expect(deleted.status).toBe(204)
    const rows = await h.env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM users WHERE id = ?1) AS users,
         (SELECT COUNT(*) FROM activities WHERE user_id = ?1) AS activities`,
    )
      .bind(uid)
      .first()
    expect(rows).toEqual({ users: 0, activities: 0 })
  })

  it('counts a reservation that a crashed upload left, and lets the same activity take it over', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    await setKeepFiles(h, token, true)
    const id = await createActivity(h, token)
    await h.env.DB.prepare(
      "UPDATE activities SET file_size = ?, file_reservation_token = 'crashed-request' WHERE id = ?",
    )
      .bind(SIZE, id)
      .run()
    expect(await stored(h, uid)).toEqual(bytes(SIZE))
    // The other rows fill the rest of the quota, so the upload fits only because it replaces its
    // own reservation rather than adding to it.
    await h.env.DB.prepare(
      `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
        digest_json, file_name, file_hash, file_size, created_at)
       VALUES ('filler', ?, 'filler', 'run', 1, 'filler', 1, '{}', 'f.fit', 'h', ?, 0)`,
    )
      .bind(uid, MAX_STORED_BYTES_PER_USER - SIZE)
      .run()
    expect(await stored(h, uid)).toEqual(bytes(MAX_STORED_BYTES_PER_USER))

    expect((await upload(h, token, id)).status).toBe(200)
    expect(await stored(h, uid)).toEqual(bytes(MAX_STORED_BYTES_PER_USER))
  })
})

describe('the storage quota check', () => {
  it("reads the counter and does not sum the user's rows", async () => {
    const counted = countingDb(testEnv().DB)
    const h = createHarness({}, { DB: counted.db })
    const token = await h.signIn()
    await setKeepFiles(h, token, true)
    const id = await createActivity(h, token)
    counted.reset()

    expect((await upload(h, token, id)).status).toBe(200)

    const sums = counted.statements().filter((sql) => /sum\s*\(\s*file_size/i.test(sql))
    expect(sums).toEqual([])
    expect(counted.statements().some((sql) => /\bfile_bytes\b/.test(sql))).toBe(true)
  })

  it('refuses an upload that would pass the cap, with 403 storage_quota', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    await setKeepFiles(h, token, true)
    const id = await createActivity(h, token)
    await h.env.DB.prepare('UPDATE users SET file_bytes = ? WHERE id = ?')
      .bind(MAX_STORED_BYTES_PER_USER - SIZE + 1, uid)
      .run()

    const res = await upload(h, token, id)
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: { code: 'storage_quota' } })
    const row = await h.env.DB.prepare('SELECT file_size FROM activities WHERE id = ?')
      .bind(id)
      .first<{ file_size: number | null }>()
    expect(row?.file_size).toBeNull()
  })

  it('admits an upload that exactly fills the cap', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    await setKeepFiles(h, token, true)
    const id = await createActivity(h, token)
    await h.env.DB.prepare('UPDATE users SET file_bytes = ? WHERE id = ?')
      .bind(MAX_STORED_BYTES_PER_USER - SIZE, uid)
      .run()

    expect((await upload(h, token, id)).status).toBe(200)
  })
})
