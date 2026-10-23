import { describe, expect, it, vi } from 'vitest'
import { createHarness, digestFixture, racingBucket, START, testEnv } from '../test/harness.ts'
import { runMaintenance } from '../maintenance.ts'
import { systemDeps } from '../deps.ts'
import { activityFileKey, userFilePrefix } from '../storage.ts'
import { sha256Hex } from '../util.ts'

const profileInput = { massKg: 80, bikeMassKg: 10, units: 'metric', keepFiles: false }

async function userIdOf(h: ReturnType<typeof createHarness>, token: string): Promise<string> {
  const body = (await (
    await h.send({ path: '/api/me', cookies: { rca_session: token } })
  ).json()) as {
    user: { id: string }
  }
  return body.user.id
}

/** Creates an activity with its original file uploaded, and returns its id. */
async function createWithFile(
  h: ReturnType<typeof createHarness>,
  token: string,
  fileName: string,
  startMs: number,
): Promise<string> {
  const enabled = await h.send({
    method: 'PUT',
    path: '/api/profile',
    json: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: true },
    cookies: { rca_session: token },
  })
  expect(enabled.status).toBe(200)
  const content = new TextEncoder().encode(`ride ${fileName}`)
  const created = await h.send({
    method: 'POST',
    path: '/api/activities',
    json: { digest: digestFixture({ startMs }), fileName, fileHash: await sha256Hex(content) },
    cookies: { rca_session: token },
  })
  const { id } = (await created.json()) as { id: string }
  const uploaded = await h.send({
    method: 'PUT',
    path: `/api/activities/${id}/file`,
    raw: content,
    cookies: { rca_session: token },
  })
  expect(uploaded.status).toBe(200)
  return id
}

async function countRows(h: ReturnType<typeof createHarness>, table: string, userId?: string) {
  const row = userId
    ? await h.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`)
        .bind(userId)
        .first<{ n: number }>()
    : await h.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>()
  return row?.n
}

describe('GET /api/me', () => {
  it('returns 401 when signed out', async () => {
    const h = createHarness()
    const res = await h.send({ path: '/api/me' })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({
      error: { code: 'unauthenticated', message: 'Sign in required' },
    })
  })

  it('returns the user and their default profile', async () => {
    const h = createHarness()
    const token = await h.signIn('rider@example.com', 'Rider')
    const res = await h.send({ path: '/api/me', cookies: { rca_session: token } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      user: { id: expect.any(String), email: 'rider@example.com', name: 'Rider', pictureUrl: null },
      profile: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: false, updatedAt: START },
      fileRetentionAvailable: true,
    })
  })

  it('creates a missing profile with the defaults', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await h.env.DB.prepare('DELETE FROM profiles').run()
    const res = await h.send({ path: '/api/me', cookies: { rca_session: token } })
    expect(await res.json()).toMatchObject({ profile: { massKg: 75, keepFiles: false } })
    expect(await countRows(h, 'profiles')).toBe(1)
  })

  it('reports unavailable retention and keeps new profiles off in a D1-only deployment', async () => {
    const h = createHarness({}, { FILES: undefined })
    const token = await h.signIn()
    const res = await h.send({ path: '/api/me', cookies: { rca_session: token } })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      profile: { keepFiles: false },
      fileRetentionAvailable: false,
    })
  })
})

describe('PUT /api/profile', () => {
  it('rejects enabling retention without R2 but accepts unrelated edits to a legacy enabled profile', async () => {
    const r2 = createHarness()
    const token = await r2.signIn()
    const enabled = await r2.send({
      method: 'PUT',
      path: '/api/profile',
      json: { ...profileInput, keepFiles: true },
      cookies: { rca_session: token },
    })
    expect(enabled.status).toBe(200)

    const d1Only = createHarness({}, { FILES: undefined })
    const noR2Enable = await d1Only.send({
      method: 'PUT',
      path: '/api/profile',
      json: { ...profileInput, keepFiles: true },
      cookies: { rca_session: token },
    })
    // This account is already enabled, so an unchanged preference remains editable.
    expect(noR2Enable.status).toBe(200)

    const fresh = await d1Only.signIn('fresh@example.com')
    const refused = await d1Only.send({
      method: 'PUT',
      path: '/api/profile',
      json: { ...profileInput, keepFiles: true },
      cookies: { rca_session: fresh },
    })
    expect(refused.status).toBe(503)
    expect(await refused.json()).toMatchObject({ error: { code: 'file_storage_unavailable' } })
    const me = await d1Only.send({ path: '/api/me', cookies: { rca_session: fresh } })
    expect(await me.json()).toMatchObject({ profile: { keepFiles: false } })
  })

  it('preserves existing files and profile when a D1-only deployment cannot turn retention off', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const file = await createWithFile(h, token, 'a.fit', START)
    const id = await userIdOf(h, token)
    const d1Only = createHarness({}, { FILES: undefined })
    const refused = await d1Only.send({
      method: 'PUT',
      path: '/api/profile',
      json: { ...profileInput, keepFiles: false },
      cookies: { rca_session: token },
    })
    expect(refused.status).toBe(503)
    const me = await d1Only.send({ path: '/api/me', cookies: { rca_session: token } })
    expect(await me.json()).toMatchObject({ profile: { keepFiles: true } })
    expect(await h.env.FILES!.get(activityFileKey(id, file))).not.toBeNull()

    const download = await d1Only.send({
      path: `/api/activities/${file}/file`,
      cookies: { rca_session: token },
    })
    expect(download.status).toBe(503)
    expect(await download.json()).toMatchObject({ error: { code: 'file_storage_unavailable' } })

    const deletion = await d1Only.send({
      method: 'DELETE',
      path: '/api/me',
      cookies: { rca_session: token },
    })
    expect(deletion.status).toBe(503)
    expect(await countRows(d1Only, 'users')).toBe(1)
  })

  it('leaves the profile and files unchanged when global cleanup headroom is exhausted', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const file = await createWithFile(h, token, 'a.fit', START)
    const id = await userIdOf(h, token)
    await h.env.DB.prepare(
      'UPDATE r2_storage_budget SET monthly_period = ?, monthly_operations = ?',
    )
      .bind('2026-01', 100_000)
      .run()

    const refused = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: false },
      cookies: { rca_session: token },
    })
    expect(refused.status).toBe(429)
    expect(await refused.json()).toMatchObject({
      error: { code: 'storage_budget_exhausted' },
    })
    const me = await h.send({ path: '/api/me', cookies: { rca_session: token } })
    expect(await me.json()).toMatchObject({ profile: { keepFiles: true } })
    expect(await h.env.FILES!.get(activityFileKey(id, file))).not.toBeNull()
  })

  it('saves the profile and stamps updatedAt', async () => {
    const h = createHarness()
    const token = await h.signIn()
    h.clock.now += 5_000
    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: profileInput,
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ...profileInput, updatedAt: START + 5_000 })
    const me = await h.send({ path: '/api/me', cookies: { rca_session: token } })
    expect(await me.json()).toMatchObject({
      profile: { ...profileInput, updatedAt: START + 5_000 },
    })
  })

  it('inserts the profile when none exists yet', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await h.env.DB.prepare('DELETE FROM profiles').run()
    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: profileInput,
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(200)
    expect(await countRows(h, 'profiles')).toBe(1)
  })

  it('accepts the bounds of each field', async () => {
    const h = createHarness()
    const token = await h.signIn()
    for (const bounds of [
      { massKg: 30, bikeMassKg: 3 },
      { massKg: 200, bikeMassKg: 30 },
    ]) {
      const res = await h.send({
        method: 'PUT',
        path: '/api/profile',
        json: { ...profileInput, ...bounds },
        cookies: { rca_session: token },
      })
      expect(res.status).toBe(200)
    }
  })

  it('rejects out-of-range or malformed values with 400', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const bad: Record<string, unknown>[] = [
      { massKg: 29.9 },
      { massKg: 200.1 },
      { massKg: 'heavy' },
      { bikeMassKg: 2.9 },
      { bikeMassKg: 30.1 },
      { units: 'furlongs' },
      { keepFiles: 'yes' },
      { massKg: undefined },
    ]
    for (const override of bad) {
      const res = await h.send({
        method: 'PUT',
        path: '/api/profile',
        json: { ...profileInput, ...override },
        cookies: { rca_session: token },
      })
      expect(res.status, JSON.stringify(override)).toBe(400)
      expect(await res.json()).toMatchObject({ error: { code: 'invalid_request' } })
    }
  })

  it('rejects a body that is not JSON', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      raw: new TextEncoder().encode('{'),
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(400)
  })

  it('returns 401 when signed out', async () => {
    const h = createHarness()
    const res = await h.send({ method: 'PUT', path: '/api/profile', json: profileInput })
    expect(res.status).toBe(401)
  })

  it('changes only the signed-in user profile', async () => {
    const h = createHarness()
    const alice = await h.signIn('alice@example.com', 'Alice')
    const bob = await h.signIn('bob@example.com', 'Bob')
    await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: profileInput,
      cookies: { rca_session: alice },
    })
    const bobMe = await h.send({ path: '/api/me', cookies: { rca_session: bob } })
    expect(await bobMe.json()).toMatchObject({ profile: { massKg: 75, keepFiles: false } })
  })
})

describe('turning keepFiles off', () => {
  const off = { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: false }
  const on = { ...off, keepFiles: true }

  it('deletes the user files and clears their rows, and only theirs', async () => {
    const h = createHarness()
    const alice = await h.signIn('alice@example.com', 'Alice')
    const bob = await h.signIn('bob@example.com', 'Bob')
    const aliceId = await userIdOf(h, alice)
    const bobId = await userIdOf(h, bob)
    const first = await createWithFile(h, alice, 'a.fit', START)
    const second = await createWithFile(h, alice, 'b.fit', START + 3_600_000)
    const bobFile = await createWithFile(h, bob, 'c.fit', START)

    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: off,
      cookies: { rca_session: alice },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ keepFiles: false })

    expect(await h.env.FILES!.get(activityFileKey(aliceId, first))).toBeNull()
    expect(await h.env.FILES!.get(activityFileKey(aliceId, second))).toBeNull()
    expect(await h.env.FILES!.get(activityFileKey(bobId, bobFile))).not.toBeNull()

    const rows = await h.env.DB.prepare(
      'SELECT file_key, file_size FROM activities WHERE user_id = ?',
    )
      .bind(aliceId)
      .all<{ file_key: string | null; file_size: number | null }>()
    expect(rows.results).toEqual([
      { file_key: null, file_size: null },
      { file_key: null, file_size: null },
    ])

    const gone = await h.send({
      path: `/api/activities/${first}/file`,
      cookies: { rca_session: alice },
    })
    expect(gone.status).toBe(404)
    expect(await gone.json()).toMatchObject({ error: { code: 'no_file' } })
    const list = (await (
      await h.send({ path: '/api/activities', cookies: { rca_session: alice } })
    ).json()) as {
      items: { hasFile: boolean }[]
    }
    expect(list.items.every((r) => !r.hasFile)).toBe(true)
  })

  it('sweeps again after the rows change, so an upload that raced the change is removed', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await userIdOf(h, token)
    await createWithFile(h, token, 'a.fit', START)
    const racing = createHarness(
      {},
      {
        FILES: racingBucket(h.env.FILES!, () =>
          h.env
            .FILES!.put(`${userFilePrefix(id)}late-upload`, 'landed after the first sweep')
            .then(() => undefined),
        ),
      },
    )
    const res = await racing.send({
      method: 'PUT',
      path: '/api/profile',
      json: off,
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(200)
    expect(await h.env.FILES!.get(`${userFilePrefix(id)}late-upload`)).toBeNull()
  })

  it('does nothing when keepFiles stays off or stays on', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await userIdOf(h, token)
    await createWithFile(h, token, 'a.fit', START)
    await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: off,
      cookies: { rca_session: token },
    })
    await h.env.FILES!.put(`${userFilePrefix(id)}stray`, 'keep me')

    expect(
      (
        await h.send({
          method: 'PUT',
          path: '/api/profile',
          json: off,
          cookies: { rca_session: token },
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await h.send({
          method: 'PUT',
          path: '/api/profile',
          json: on,
          cookies: { rca_session: token },
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await h.send({
          method: 'PUT',
          path: '/api/profile',
          json: on,
          cookies: { rca_session: token },
        })
      ).status,
    ).toBe(200)
    expect(await h.env.FILES!.get(`${userFilePrefix(id)}stray`)).not.toBeNull()
  })

  it('does not touch storage at all when keepFiles was already off', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: off,
      cookies: { rca_session: token },
    })
    const broken = createHarness({}, { FILES: brokenBucket() })
    const res = await broken.send({
      method: 'PUT',
      path: '/api/profile',
      json: off,
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(200)
  })

  it('leaves the profile and files unchanged when R2 deletion fails, so it can be retried', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const h = createHarness()
    const token = await h.signIn()
    const id = await userIdOf(h, token)
    const file = await createWithFile(h, token, 'a.fit', START)

    const broken = createHarness({}, { FILES: brokenBucket() })
    const res = await broken.send({
      method: 'PUT',
      path: '/api/profile',
      json: off,
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: { code: 'internal_error' } })

    const me = (await (
      await h.send({ path: '/api/me', cookies: { rca_session: token } })
    ).json()) as {
      profile: { keepFiles: boolean }
    }
    expect(me.profile.keepFiles).toBe(true)
    expect(await h.env.FILES!.get(activityFileKey(id, file))).not.toBeNull()
    const download = await h.send({
      path: `/api/activities/${file}/file`,
      cookies: { rca_session: token },
    })
    expect(download.status).toBe(200)

    const retry = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: off,
      cookies: { rca_session: token },
    })
    expect(retry.status).toBe(200)
    expect(await h.env.FILES!.get(activityFileKey(id, file))).toBeNull()
    spy.mockRestore()
  })
})

function brokenBucket(): R2Bucket {
  return {
    list: async () => {
      throw new Error('R2 unavailable')
    },
  } as unknown as R2Bucket
}

describe('DELETE /api/me', () => {
  it('returns 401 when signed out', async () => {
    const h = createHarness()
    expect((await h.send({ method: 'DELETE', path: '/api/me' })).status).toBe(401)
  })

  it('removes the account, its rows and its stored files, and leaves other users alone', async () => {
    const h = createHarness()
    const alice = await h.signIn('alice@example.com', 'Alice')
    const bob = await h.signIn('bob@example.com', 'Bob')
    const aliceId = await userIdOf(h, alice)
    const bobId = await userIdOf(h, bob)
    const aliceAct = await createWithFile(h, alice, 'a.fit', START)
    const bobAct = await createWithFile(h, bob, 'b.fit', START + 3_600_000)
    expect(await h.env.FILES!.get(activityFileKey(aliceId, aliceAct))).not.toBeNull()

    const res = await h.send({ method: 'DELETE', path: '/api/me', cookies: { rca_session: alice } })
    expect(res.status).toBe(204)
    expect(res.headers.get('set-cookie')).toMatch(/^rca_session=;/)

    expect(await h.env.FILES!.get(activityFileKey(aliceId, aliceAct))).toBeNull()
    expect(await h.env.FILES!.get(activityFileKey(bobId, bobAct))).not.toBeNull()
    expect(await countRows(h, 'users')).toBe(1)
    expect(await countRows(h, 'activities', aliceId)).toBe(0)
    expect(await countRows(h, 'sessions', aliceId)).toBe(0)
    expect(await countRows(h, 'profiles', aliceId)).toBe(0)
    expect(await countRows(h, 'activities', bobId)).toBe(1)

    expect((await h.send({ path: '/api/me', cookies: { rca_session: alice } })).status).toBe(401)
    expect((await h.send({ path: '/api/me', cookies: { rca_session: bob } })).status).toBe(200)
  })

  it('sweeps again after the account row is gone, so a racing upload leaves nothing behind', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await userIdOf(h, token)
    await createWithFile(h, token, 'a.fit', START)
    const racing = createHarness(
      {},
      {
        FILES: racingBucket(h.env.FILES!, () =>
          h.env
            .FILES!.put(`${userFilePrefix(id)}late-upload`, 'landed after the first sweep')
            .then(() => undefined),
        ),
      },
    )
    const res = await racing.send({
      method: 'DELETE',
      path: '/api/me',
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(204)
    expect(await h.env.FILES!.list({ prefix: userFilePrefix(id) })).toMatchObject({ objects: [] })
  })

  it('cleans up a real R2 upload that finishes after account deletion', async () => {
    let markPutStarted!: () => void
    const putStarted = new Promise<void>((resolve) => {
      markPutStarted = resolve
    })
    let releasePut!: () => void
    const putGate = new Promise<void>((resolve) => {
      releasePut = resolve
    })
    const files = new Proxy(testEnv().FILES!, {
      get(target, property) {
        if (property === 'put') {
          return async (...args: Parameters<R2Bucket['put']>) => {
            markPutStarted()
            await putGate
            return target.put(...args)
          }
        }
        const value = Reflect.get(target, property, target) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const h = createHarness({}, { FILES: files })
    const token = await h.signIn()
    const uid = await userIdOf(h, token)
    const enabled = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: true },
      cookies: { rca_session: token },
    })
    expect(enabled.status).toBe(200)
    const content = new TextEncoder().encode('racing account deletion upload')
    const created = await h.send({
      method: 'POST',
      path: '/api/activities',
      json: {
        digest: digestFixture(),
        fileName: 'pending.fit',
        fileHash: await sha256Hex(content),
      },
      cookies: { rca_session: token },
    })
    const { id: activityId } = (await created.json()) as { id: string }
    const upload = h.send({
      method: 'PUT',
      path: `/api/activities/${activityId}/file`,
      raw: content,
      cookies: { rca_session: token },
    })
    await putStarted

    const deleted = await h.send({
      method: 'DELETE',
      path: '/api/me',
      cookies: { rca_session: token },
    })
    expect(deleted.status).toBe(204)
    releasePut()

    expect((await upload).status).toBe(404)
    expect(await h.env.FILES!.list({ prefix: userFilePrefix(uid) })).toMatchObject({ objects: [] })
  })

  it('keeps the account when its files cannot be removed, so the deletion can be retried', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const h = createHarness()
    const token = await h.signIn()
    // An account with no stored files never reaches R2, so the test needs one.
    await createWithFile(h, token, 'a.fit', START)
    const brokenFiles = {
      list: async () => {
        throw new Error('R2 unavailable')
      },
    } as unknown as R2Bucket
    const broken = createHarness({}, { FILES: brokenFiles })
    const res = await broken.send({
      method: 'DELETE',
      path: '/api/me',
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(500)
    expect(await countRows(h, 'users')).toBe(1)
    spy.mockRestore()
  })
})

describe('cleanup budget is spent only when a user has stored files', () => {
  const off = { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: false }
  const exhaust = (h: ReturnType<typeof createHarness>) =>
    h.env.DB.prepare(
      "UPDATE r2_storage_budget SET monthly_period = '2026-01', monthly_operations = 100000",
    ).run()

  it('lets keepFiles be turned off when the user has no files, even with cleanup exhausted', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { ...off, keepFiles: true },
      cookies: { rca_session: token },
    })
    await exhaust(h)
    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: off,
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(200)
  })

  it('lets an account with no files be deleted even with cleanup exhausted', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await exhaust(h)
    const res = await h.send({ method: 'DELETE', path: '/api/me', cookies: { rca_session: token } })
    expect(res.status).toBe(204)
    expect(await countRows(h, 'users')).toBe(0)
  })
})

describe('account deletion tombstone', () => {
  it('refuses ordinary routes for an account marked for deletion, but still allows its deletion to finish', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await h.env.DB.prepare('UPDATE users SET deleting_at = ?').bind(START).run()
    expect((await h.send({ path: '/api/me', cookies: { rca_session: token } })).status).toBe(401)
    const res = await h.send({ method: 'DELETE', path: '/api/me', cookies: { rca_session: token } })
    expect(res.status).toBe(204)
    expect(await countRows(h, 'users')).toBe(0)
  })

  it('keeps the account retryable when the first R2 sweep fails, and finishes on retry', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const h = createHarness()
    const token = await h.signIn()
    const id = await userIdOf(h, token)
    const file = await createWithFile(h, token, 'a.fit', START)
    let lists = 0
    const flaky = new Proxy(h.env.FILES!, {
      get(target, property) {
        if (property === 'list')
          return async (...args: Parameters<R2Bucket['list']>) => {
            lists += 1
            if (lists === 1) throw new Error('simulated R2 outage')
            return target.list(...args)
          }
        const value = Reflect.get(target, property, target) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const first = await createHarness({}, { FILES: flaky }).send({
      method: 'DELETE',
      path: '/api/me',
      cookies: { rca_session: token },
    })
    expect(first.status).toBe(500)
    expect(await countRows(h, 'users')).toBe(1)
    expect(await h.env.FILES!.get(activityFileKey(id, file))).not.toBeNull()

    const retry = await h.send({
      method: 'DELETE',
      path: '/api/me',
      cookies: { rca_session: token },
    })
    expect(retry.status).toBe(204)
    expect(await h.env.FILES!.get(activityFileKey(id, file))).toBeNull()
    spy.mockRestore()
  })

  it('reports success once the rows are gone, and leaves a racing object to the scheduler', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const h = createHarness()
    const token = await h.signIn()
    const id = await userIdOf(h, token)
    await createWithFile(h, token, 'a.fit', START)
    let lists = 0
    let raced = false
    const racing = new Proxy(h.env.FILES!, {
      get(target, property) {
        if (property === 'list')
          return async (...args: Parameters<R2Bucket['list']>) => {
            lists += 1
            // The final sweep's LIST fails, so an object that lands after the first sweep stays.
            if (lists === 2) throw new Error('simulated R2 outage')
            return target.list(...args)
          }
        if (property === 'delete')
          return async (...args: Parameters<R2Bucket['delete']>) => {
            const result = await target.delete(...args)
            if (!raced) {
              raced = true
              await target.put(`${userFilePrefix(id)}late-upload`, 'landed after the first sweep')
            }
            return result
          }
        const value = Reflect.get(target, property, target) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const res = await createHarness({}, { FILES: racing }).send({
      method: 'DELETE',
      path: '/api/me',
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(204)
    expect(await countRows(h, 'users')).toBe(0)
    expect(await h.env.FILES!.get(`${userFilePrefix(id)}late-upload`)).not.toBeNull()
    expect(await countRows(h, 'pending_account_deletions')).toBe(1)

    const report = await runMaintenance(h.env, { ...systemDeps, now: () => START + 1000 })
    expect(report.finishedDeletions).toBe(1)
    expect(await h.env.FILES!.get(`${userFilePrefix(id)}late-upload`)).toBeNull()
    expect(await countRows(h, 'pending_account_deletions')).toBe(0)
    spy.mockRestore()
  })
})
