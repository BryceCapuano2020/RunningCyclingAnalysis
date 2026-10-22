import { describe, expect, it } from 'vitest'
import { activityFileKey } from '../storage.ts'
import { createHarness, digestFixture, START, type Harness } from '../test/harness.ts'
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

async function createActivity(
  h: Harness,
  token: string,
  overrides: Record<string, unknown> = {},
  digest: Record<string, unknown> = {},
): Promise<Response> {
  return h.send({
    method: 'POST',
    path: '/api/activities',
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

describe('POST /api/activities', () => {
  it('creates the record with 201; non-finite digest numbers go out as JSON null', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await createActivity(h, token)
    expect(res.status).toBe(201)
    const record = (await res.json()) as {
      id: string
      digest: { curve: { value: number | null; terms: { aero: number | null } | null }[] }
      fileName: string
      hasFile: boolean
      fileSize: number | null
      createdAt: number
    }
    expect(record).toMatchObject({
      fileName: 'ride.fit',
      hasFile: false,
      fileSize: null,
      createdAt: START,
    })
    expect(record.digest.curve[0]?.value).toBe(350)
    expect(record.digest.curve[1]?.value).toBeNull()
    expect(record.digest.curve[1]?.terms?.aero).toBeNull()

    const row = await h.env.DB.prepare(
      'SELECT digest_json, dedupe_key, sport, start_ms FROM activities',
    ).first<{
      digest_json: string
      dedupe_key: string
      sport: string
      start_ms: number
    }>()
    expect(row?.digest_json).toContain('"value":null')
    expect(row).toMatchObject({
      dedupe_key: `ride-${START / 1000}`,
      sport: 'ride',
      start_ms: START,
    })
  })

  it('returns the existing record with 200 for the same sport and second', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const first = await idOf(await createActivity(h, token))
    const again = await createActivity(h, token, {}, { startMs: START + 400, name: 'Renamed' })
    expect(again.status).toBe(200)
    expect(await idOf(again)).toBe(first)
    expect(
      await h.env.DB.prepare('SELECT COUNT(*) AS n FROM activities').first<{ n: number }>(),
    ).toEqual({ n: 1 })
  })

  it('treats a different sport or a different second as a new activity', async () => {
    const h = createHarness()
    const token = await h.signIn()
    expect((await createActivity(h, token)).status).toBe(201)
    expect((await createActivity(h, token, {}, { sport: 'run' })).status).toBe(201)
    expect((await createActivity(h, token, {}, { startMs: START + 1000 })).status).toBe(201)
  })

  it('dedupes per user, so two users can upload the same ride', async () => {
    const h = createHarness()
    const alice = await h.signIn('alice@example.com')
    const bob = await h.signIn('bob@example.com')
    expect((await createActivity(h, alice)).status).toBe(201)
    expect((await createActivity(h, bob)).status).toBe(201)
  })

  it('rejects a body that does not match the schema with 400', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const bad: Record<string, unknown>[] = [
      {
        fileHash: HASH_OF_CONTENT,
        fileName: 'x.fit',
        digest: { ...digestFixture(), sport: 'swim' },
      },
      { fileHash: 'ABC', fileName: 'x.fit', digest: digestFixture() },
      { fileHash: HASH_OF_CONTENT, fileName: '', digest: digestFixture() },
      { fileHash: HASH_OF_CONTENT, fileName: 'x.fit', digest: digestFixture({ startMs: null }) },
      { fileHash: HASH_OF_CONTENT, fileName: 'x.fit', digest: digestFixture({ version: 2 }) },
      { fileHash: HASH_OF_CONTENT, fileName: 'x.fit' },
    ]
    for (const json of bad) {
      const res = await h.send({ method: 'POST', path: '/api/activities', json, ...as(token) })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: { code: 'invalid_request' } })
    }
  })

  it('rejects a body that is not JSON with 400', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await h.send({
      method: 'POST',
      path: '/api/activities',
      raw: new TextEncoder().encode('[not json'),
      ...as(token),
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'invalid_json' } })
  })

  it('rejects a digest whose JSON is over 256 KB with 413', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const big = digestFixture({
      flags: [{ kind: 'hr-spike', start: 0, end: 1, message: 'x'.repeat(262_144) }],
    })
    const res = await createActivity(h, token, {}, { flags: big.flags })
    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({ error: { code: 'digest_too_large' } })
  })

  it('rejects a request body far over the limit with 413 before parsing it', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await createActivity(
      h,
      token,
      {},
      { flags: [{ kind: 'hr-spike', start: 0, end: 1, message: 'x'.repeat(300_000) }] },
    )
    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({ error: { code: 'payload_too_large' } })
  })

  it('returns 401 when signed out', async () => {
    const h = createHarness()
    const res = await h.send({ method: 'POST', path: '/api/activities', json: {} })
    expect(res.status).toBe(401)
  })
})

describe('GET /api/activities', () => {
  it('returns an empty list before any upload', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await h.send({ path: '/api/activities', ...as(token) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('lists activities newest first by start time', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const early = await idOf(await createActivity(h, token, {}, { startMs: START }))
    const late = await idOf(await createActivity(h, token, {}, { startMs: START + 7_200_000 }))
    const middle = await idOf(await createActivity(h, token, {}, { startMs: START + 3_600_000 }))
    const list = (await (await h.send({ path: '/api/activities', ...as(token) })).json()) as {
      id: string
    }[]
    expect(list.map((r) => r.id)).toEqual([late, middle, early])
  })

  it('returns only records created at or after since, for incremental sync', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await createActivity(h, token, {}, { startMs: START + 1 })
    h.clock.now += 1_000
    const second = await idOf(await createActivity(h, token, {}, { startMs: START + 2_000_000 }))
    h.clock.now += 1_000
    const third = await idOf(await createActivity(h, token, {}, { startMs: START + 4_000_000 }))

    const since = (await (
      await h.send({ path: `/api/activities?since=${START + 1_000}`, ...as(token) })
    ).json()) as { id: string }[]
    expect(since.map((r) => r.id).sort()).toEqual([second, third].sort())
    const none = await h.send({ path: `/api/activities?since=${START + 99_999}`, ...as(token) })
    expect(await none.json()).toEqual([])
  })

  it('rejects a since value that is not a non-negative integer', async () => {
    const h = createHarness()
    const token = await h.signIn()
    for (const since of ['abc', '-1', '1.5']) {
      const res = await h.send({ path: `/api/activities?since=${since}`, ...as(token) })
      expect(res.status, since).toBe(400)
    }
  })

  it('returns 401 when signed out', async () => {
    const h = createHarness()
    expect((await h.send({ path: '/api/activities' })).status).toBe(401)
  })
})

describe('original file upload and download', () => {
  it('stores the file in R2 under the user prefix and serves it back', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const uid = await userId(h, token)

    const put = await h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: CONTENT,
      ...as(token),
    })
    expect(put.status).toBe(200)
    expect(await put.json()).toMatchObject({ id, hasFile: true, fileSize: CONTENT.byteLength })
    const stored = await h.env.FILES.get(activityFileKey(uid, id))
    expect(stored).not.toBeNull()
    expect(new Uint8Array((await stored?.arrayBuffer()) ?? [])).toEqual(CONTENT)

    const get = await h.send({ path: `/api/activities/${id}/file`, ...as(token) })
    expect(get.status).toBe(200)
    expect(get.headers.get('content-type')).toBe('application/octet-stream')
    expect(get.headers.get('content-length')).toBe(String(CONTENT.byteLength))
    expect(get.headers.get('content-disposition')).toBe(
      `attachment; filename="ride.fit"; filename*=UTF-8''ride.fit`,
    )
    expect(get.headers.get('cache-control')).toBe('private, no-store')
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(CONTENT)
  })

  it('replaces an earlier upload for the same activity', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    await h.send({ method: 'PUT', path: `/api/activities/${id}/file`, raw: CONTENT, ...as(token) })
    const again = await h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: CONTENT,
      ...as(token),
    })
    expect(again.status).toBe(200)
  })

  it('refuses the upload with 409 when keepFiles is off, and stores nothing', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const uid = await userId(h, token)
    await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: false },
      ...as(token),
    })
    const res = await h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: CONTENT,
      ...as(token),
    })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: { code: 'files_disabled' } })
    expect(await h.env.FILES.get(activityFileKey(uid, id))).toBeNull()
  })

  it('rejects content whose SHA-256 does not match the digest with 422, and stores nothing', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const uid = await userId(h, token)
    const res = await h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: new TextEncoder().encode('tampered'),
      ...as(token),
    })
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: { code: 'hash_mismatch' } })
    expect(await h.env.FILES.get(activityFileKey(uid, id))).toBeNull()
    const me = (await (await h.send({ path: '/api/activities', ...as(token) })).json()) as {
      hasFile: boolean
    }[]
    expect(me[0]?.hasFile).toBe(false)
  })

  it('returns the record that won a concurrent upload of the same activity', async () => {
    let harness: Harness | undefined
    let racing = false
    const h = createHarness({
      randomUUID: () => {
        // Runs after the duplicate check and before the insert: another request lands first.
        if (racing && harness) {
          racing = false
          void harness.env.DB.prepare(
            `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
              digest_json, file_name, file_hash, created_at)
             SELECT 'winner', id, ?, 'ride', ?, 'Morning ride', 1, ?, 'ride.fit', ?, 0
             FROM users LIMIT 1`,
          )
            .bind(`ride-${START / 1000}`, START, JSON.stringify(digestFixture()), HASH_OF_CONTENT)
            .run()
        }
        return 'loser'
      },
    })
    harness = h
    const token = await h.signIn()
    racing = true
    const res = await createActivity(h, token)
    expect(res.status).toBe(200)
    expect(await idOf(res)).toBe('winner')
    expect(
      await h.env.DB.prepare('SELECT COUNT(*) AS n FROM activities').first<{ n: number }>(),
    ).toEqual({ n: 1 })
  })

  it('rejects an empty body with 400', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const res = await h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: new Uint8Array(0),
      ...as(token),
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'empty_file' } })
  })

  it('rejects a file over 50 MB with 413, and stores nothing', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const uid = await userId(h, token)
    const tooBig = new Uint8Array(50 * 1024 * 1024 + 1)
    const res = await h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: tooBig,
      ...as(token),
    })
    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({ error: { code: 'payload_too_large' } })
    expect(await h.env.FILES.get(activityFileKey(uid, id))).toBeNull()
  })

  it('returns 404 for an unknown activity on upload, download and delete', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const path = '/api/activities/nope/file'
    expect((await h.send({ method: 'PUT', path, raw: CONTENT, ...as(token) })).status).toBe(404)
    expect((await h.send({ path, ...as(token) })).status).toBe(404)
    expect(
      (await h.send({ method: 'DELETE', path: '/api/activities/nope', ...as(token) })).status,
    ).toBe(404)
  })

  it('returns 404 when there is no file to download, or the stored object is gone', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const none = await h.send({ path: `/api/activities/${id}/file`, ...as(token) })
    expect(none.status).toBe(404)
    expect(await none.json()).toMatchObject({ error: { code: 'no_file' } })

    await h.send({ method: 'PUT', path: `/api/activities/${id}/file`, raw: CONTENT, ...as(token) })
    await h.env.FILES.delete(activityFileKey(await userId(h, token), id))
    const gone = await h.send({ path: `/api/activities/${id}/file`, ...as(token) })
    expect(gone.status).toBe(404)
    expect(await gone.json()).toMatchObject({ error: { code: 'no_file' } })
  })

  it('deletes the row and the stored object together', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const uid = await userId(h, token)
    await h.send({ method: 'PUT', path: `/api/activities/${id}/file`, raw: CONTENT, ...as(token) })

    const res = await h.send({ method: 'DELETE', path: `/api/activities/${id}`, ...as(token) })
    expect(res.status).toBe(204)
    expect(await h.env.FILES.get(activityFileKey(uid, id))).toBeNull()
    expect(await (await h.send({ path: '/api/activities', ...as(token) })).json()).toEqual([])
    expect(
      (await h.send({ method: 'DELETE', path: `/api/activities/${id}`, ...as(token) })).status,
    ).toBe(404)
  })

  it('deletes an activity that has no file', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    expect(
      (await h.send({ method: 'DELETE', path: `/api/activities/${id}`, ...as(token) })).status,
    ).toBe(204)
  })

  it('returns 401 on every file route when signed out', async () => {
    const h = createHarness()
    const path = '/api/activities/x/file'
    expect((await h.send({ method: 'PUT', path, raw: CONTENT })).status).toBe(401)
    expect((await h.send({ path })).status).toBe(401)
    expect((await h.send({ method: 'DELETE', path: '/api/activities/x' })).status).toBe(401)
  })
})

describe('cross-user isolation', () => {
  it('lets a user see and touch only their own activities and files', async () => {
    const h = createHarness()
    const alice = await h.signIn('alice@example.com', 'Alice')
    const bob = await h.signIn('bob@example.com', 'Bob')
    const id = await idOf(await createActivity(h, alice))
    const aliceId = await userId(h, alice)
    await h.send({ method: 'PUT', path: `/api/activities/${id}/file`, raw: CONTENT, ...as(alice) })

    // Bob's list is empty.
    expect(await (await h.send({ path: '/api/activities', ...as(bob) })).json()).toEqual([])

    // Bob cannot read, overwrite or delete Alice's activity or file.
    const bobPut = await h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: CONTENT,
      ...as(bob),
    })
    expect(bobPut.status).toBe(404)
    expect((await h.send({ path: `/api/activities/${id}/file`, ...as(bob) })).status).toBe(404)
    expect(
      (await h.send({ method: 'DELETE', path: `/api/activities/${id}`, ...as(bob) })).status,
    ).toBe(404)

    // Alice's data is intact.
    const alicesList = (await (await h.send({ path: '/api/activities', ...as(alice) })).json()) as {
      id: string
      hasFile: boolean
    }[]
    expect(alicesList).toMatchObject([{ id, hasFile: true }])
    expect(await h.env.FILES.get(activityFileKey(aliceId, id))).not.toBeNull()
    const download = await h.send({ path: `/api/activities/${id}/file`, ...as(alice) })
    expect(download.status).toBe(200)
  })

  it('does not change another user profile', async () => {
    const h = createHarness()
    const alice = await h.signIn('alice@example.com', 'Alice')
    const bob = await h.signIn('bob@example.com', 'Bob')
    await createActivity(h, alice)
    await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { massKg: 90, bikeMassKg: 12, units: 'metric', keepFiles: true },
      ...as(bob),
    })
    const aliceMe = await h.send({ path: '/api/me', ...as(alice) })
    expect(await aliceMe.json()).toMatchObject({ profile: { massKg: 75 } })
  })
})
