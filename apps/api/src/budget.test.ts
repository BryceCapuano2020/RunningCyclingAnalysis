import { describe, expect, it, vi } from 'vitest'
import { DAILY_LIMITS, MAX_STORED_BYTES_PER_USER } from '@rca/contract'
import { createHarness, digestFixture, START, testEnv } from './test/harness.ts'
import { sha256Hex } from './util.ts'

const TODAY = '2026-01-15'
const CONTENT = new TextEncoder().encode('0123 fake FIT bytes')

async function userId(h: ReturnType<typeof createHarness>, token: string): Promise<string> {
  const me = (await (
    await h.send({ path: '/api/me', cookies: { rca_session: token } })
  ).json()) as {
    user: { id: string }
  }
  return me.user.id
}

/** Sets how many of an action the user has already used today (UTC). */
async function setUsed(
  h: ReturnType<typeof createHarness>,
  uid: string,
  action: string,
  used: number,
  day = TODAY,
): Promise<void> {
  await h.env.DB.prepare(
    `INSERT INTO daily_budget (user_id, day, action, used) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, day, action) DO UPDATE SET used = excluded.used`,
  )
    .bind(uid, day, action, used)
    .run()
}

async function usedOf(h: ReturnType<typeof createHarness>, uid: string, action: string) {
  const row = await h.env.DB.prepare(
    'SELECT used FROM daily_budget WHERE user_id = ? AND day = ? AND action = ?',
  )
    .bind(uid, TODAY, action)
    .first<{ used: number }>()
  return row?.used ?? 0
}

async function enableFiles(h: ReturnType<typeof createHarness>, token: string) {
  const res = await h.send({
    method: 'PUT',
    path: '/api/profile',
    json: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: true },
    cookies: { rca_session: token },
  })
  expect(res.status).toBe(200)
}

async function createActivity(
  h: ReturnType<typeof createHarness>,
  token: string,
  startMs = START,
  fileHash?: string,
): Promise<Response> {
  return h.send({
    method: 'POST',
    path: '/api/activities',
    json: {
      digest: digestFixture({ startMs }),
      fileName: 'ride.fit',
      fileHash: fileHash ?? (await sha256Hex(CONTENT)),
    },
    cookies: { rca_session: token },
  })
}

describe('daily budgets', () => {
  it('refuses the 51st profile write of a UTC day with 429 daily_limit and a Retry-After to midnight', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    await setUsed(h, uid, 'profileWrite', DAILY_LIMITS.profileWrite)

    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: false },
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: { code: 'daily_limit' } })
    // START is 12:00:00 UTC, so midnight is 12 hours (43200 seconds) away.
    expect(res.headers.get('retry-after')).toBe('43200')
  })

  it('admits exactly the 50th profile write and refuses the 51st', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const statuses: number[] = []
    for (let i = 0; i < DAILY_LIMITS.profileWrite + 1; i += 1) {
      const res = await h.send({
        method: 'PUT',
        path: '/api/profile',
        json: { massKg: 75 + (i % 2), bikeMassKg: 9, units: 'imperial', keepFiles: false },
        cookies: { rca_session: token },
      })
      statuses.push(res.status)
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(50)
    expect(statuses.at(-1)).toBe(429)
  })

  it('never admits more than the limit under concurrent writes', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const responses = await Promise.all(
      Array.from({ length: DAILY_LIMITS.profileWrite + 10 }, (_, i) =>
        h.send({
          method: 'PUT',
          path: '/api/profile',
          json: { massKg: 75 + (i % 2), bikeMassKg: 9, units: 'imperial', keepFiles: false },
          cookies: { rca_session: token },
        }),
      ),
    )
    expect(responses.filter((r) => r.status === 200)).toHaveLength(DAILY_LIMITS.profileWrite)
    expect(responses.filter((r) => r.status === 429)).toHaveLength(10)
  })

  it('starts a new budget at the next UTC midnight', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    await setUsed(h, uid, 'profileWrite', DAILY_LIMITS.profileWrite)
    h.clock.now = START + 12 * 60 * 60 * 1000
    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: false },
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(200)
  })

  it('counts file downloads and activity deletions separately, at 50 a day', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await enableFiles(h, token)
    const created = (await (await createActivity(h, token)).json()) as { id: string }
    const uid = await userId(h, token)
    await h.send({
      method: 'PUT',
      path: `/api/activities/${created.id}/file`,
      raw: CONTENT,
      cookies: { rca_session: token },
    })
    await setUsed(h, uid, 'fileDownload', DAILY_LIMITS.fileDownload)
    const download = await h.send({
      path: `/api/activities/${created.id}/file`,
      cookies: { rca_session: token },
    })
    expect(download.status).toBe(429)
    expect(await download.json()).toMatchObject({ error: { code: 'daily_limit' } })

    await setUsed(h, uid, 'activityDelete', DAILY_LIMITS.activityDelete)
    const deletion = await h.send({
      method: 'DELETE',
      path: `/api/activities/${created.id}`,
      cookies: { rca_session: token },
    })
    expect(deletion.status).toBe(429)
    expect(await deletion.json()).toMatchObject({ error: { code: 'daily_limit' } })
  })

  it('caps library listings at the daily read limit but never charges /api/me', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    await setUsed(h, uid, 'read', DAILY_LIMITS.read)
    const me = await h.send({ path: '/api/me', cookies: { rca_session: token } })
    expect(me.status).toBe(200)
    const list = await h.send({ path: '/api/activities', cookies: { rca_session: token } })
    expect(list.status).toBe(429)
    expect(await list.json()).toMatchObject({ error: { code: 'daily_limit' } })
  })

  it('allows 2,000 activity creates a day rather than the 50 used for other actions', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    await setUsed(h, uid, 'activityCreate', DAILY_LIMITS.activityCreate - 1)
    expect((await createActivity(h, token, START)).status).toBe(201)
    const refused = await createActivity(h, token, START + 60_000)
    expect(refused.status).toBe(429)
    expect(await refused.json()).toMatchObject({ error: { code: 'daily_limit' } })
  })

  it('does not charge an activity create for a retry that returns the existing activity', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    expect((await createActivity(h, token)).status).toBe(201)
    expect(await usedOf(h, uid, 'activityCreate')).toBe(1)
    expect((await createActivity(h, token)).status).toBe(200)
    expect(await usedOf(h, uid, 'activityCreate')).toBe(1)
  })

  it('gives back the upload unit when the monthly R2 budget refuses the write', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await enableFiles(h, token)
    const uid = await userId(h, token)
    const id = ((await (await createActivity(h, token)).json()) as { id: string }).id
    await h.env.DB.prepare(
      `INSERT INTO r2_storage_budget (id, lifetime_put_bytes, monthly_period, monthly_operations, monthly_put_bytes)
       VALUES (1, 0, '2026-01', 0, ${2 * 1024 * 1024 * 1024})
       ON CONFLICT(id) DO UPDATE SET monthly_period = '2026-01', monthly_operations = 0,
         monthly_put_bytes = ${2 * 1024 * 1024 * 1024}`,
    ).run()
    const refused = await h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: CONTENT,
      cookies: { rca_session: token },
    })
    expect(refused.status).toBe(429)
    expect(await refused.json()).toMatchObject({ error: { code: 'storage_budget_exhausted' } })
    expect(await usedOf(h, uid, 'fileUpload')).toBe(0)
  })
})

describe('concurrent uploads', () => {
  /** A bucket whose first `held` puts wait for the returned release function. */
  function gatedBucket(held: number) {
    let started = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const bucket = new Proxy(testEnv().FILES!, {
      get(target, property) {
        if (property === 'put') {
          return async (...args: Parameters<R2Bucket['put']>) => {
            started += 1
            if (started <= held) {
              await gate
            }
            return target.put(...args)
          }
        }
        const value = Reflect.get(target, property, target) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    return { bucket, release: () => release(), started: () => started }
  }

  async function uploadRequest(h: ReturnType<typeof createHarness>, token: string, id: string) {
    return h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: CONTENT,
      cookies: { rca_session: token },
    })
  }

  it('refuses a third concurrent upload from the same user with 429 upload_in_progress', async () => {
    const gate = gatedBucket(2)
    const h = createHarness({}, { FILES: gate.bucket })
    const token = await h.signIn()
    await enableFiles(h, token)
    const ids: string[] = []
    for (let i = 0; i < 3; i += 1) {
      ids.push(
        ((await (await createActivity(h, token, START + i * 3_600_000)).json()) as { id: string })
          .id,
      )
    }
    const first = uploadRequest(h, token, ids[0]!)
    const second = uploadRequest(h, token, ids[1]!)
    await vi.waitFor(() => expect(gate.started()).toBe(2))

    const third = await uploadRequest(h, token, ids[2]!)
    expect(third.status).toBe(429)
    expect(await third.json()).toMatchObject({ error: { code: 'upload_in_progress' } })

    gate.release()
    expect((await first).status).toBe(200)
    expect((await second).status).toBe(200)
    const fourth = await uploadRequest(h, token, ids[2]!)
    expect(fourth.status).toBe(200)
  })

  it('counts slots per user, so another user is not blocked', async () => {
    const gate = gatedBucket(2)
    const h = createHarness({}, { FILES: gate.bucket })
    const alice = await h.signIn('alice@example.com', 'Alice')
    const bob = await h.signIn('bob@example.com', 'Bob')
    await enableFiles(h, alice)
    await enableFiles(h, bob)
    const aliceIds = [0, 1].map(
      async (i) =>
        ((await (await createActivity(h, alice, START + i * 3_600_000)).json()) as { id: string })
          .id,
    )
    const bobId = ((await (await createActivity(h, bob)).json()) as { id: string }).id
    const [a0, a1] = await Promise.all(aliceIds)
    const pending = [uploadRequest(h, alice, a0!), uploadRequest(h, alice, a1!)]
    await vi.waitFor(() => expect(gate.started()).toBe(2))

    const bobUpload = await uploadRequest(h, bob, bobId!)
    expect(bobUpload.status).toBe(200)
    gate.release()
    for (const response of await Promise.all(pending)) expect(response.status).toBe(200)
  })

  it('frees a slot held by a crashed request once its lease expires', async () => {
    const gate = gatedBucket(2)
    const h = createHarness({}, { FILES: gate.bucket })
    const token = await h.signIn()
    await enableFiles(h, token)
    const ids: string[] = []
    for (let i = 0; i < 3; i += 1) {
      ids.push(
        ((await (await createActivity(h, token, START + i * 3_600_000)).json()) as { id: string })
          .id,
      )
    }
    void uploadRequest(h, token, ids[0]!)
    void uploadRequest(h, token, ids[1]!)
    await vi.waitFor(() => expect(gate.started()).toBe(2))
    expect((await uploadRequest(h, token, ids[2]!)).status).toBe(429)

    h.clock.now += 10 * 60 * 1000
    expect((await uploadRequest(h, token, ids[2]!)).status).toBe(200)
    gate.release()
  })

  it('does not hold a slot after a refused upload', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await enableFiles(h, token)
    const id = ((await (await createActivity(h, token)).json()) as { id: string }).id
    const oversize = await h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: new Uint8Array(0),
      cookies: { rca_session: token },
    })
    expect(oversize.status).toBe(400)
    const rows = await h.env.DB.prepare('SELECT COUNT(*) AS n FROM upload_slots').first<{
      n: number
    }>()
    expect(rows?.n).toBe(0)
  })
})

describe('stored-bytes quota with the daily upload budget', () => {
  it('still refuses an upload past the byte cap', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await enableFiles(h, token)
    const id = ((await (await createActivity(h, token)).json()) as { id: string }).id
    await h.env.DB.prepare(
      `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
        digest_json, file_name, file_hash, file_size, created_at)
       SELECT 'filler', id, 'filler', 'run', 1, 'filler', 1, '{}', 'f.fit', 'h', ?, 0 FROM users LIMIT 1`,
    )
      .bind(MAX_STORED_BYTES_PER_USER)
      .run()
    const res = await h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: CONTENT,
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: { code: 'storage_quota' } })
  })
})
