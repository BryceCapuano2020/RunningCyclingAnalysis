import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { describe, expect, it } from 'vitest'
import { createHarness, digestFixture, type Harness } from '../test/harness.ts'
import { seedActivityRow } from '../test/seed.ts'

const HASH = 'b'.repeat(64)

function as(token: string) {
  return { cookies: { rca_session: token } }
}

function post(h: Harness, token: string, body: unknown, query = ''): Promise<Response> {
  return h.send({ method: 'POST', path: `/api/activities${query}`, json: body, ...as(token) })
}

function create(digest: Record<string, unknown>) {
  return { digest, fileName: 'ride.fit', fileHash: HASH }
}

async function rows(h: Harness): Promise<number> {
  const row = await h.env.DB.prepare('SELECT COUNT(*) AS n FROM activities').first<{ n: number }>()
  return row?.n ?? 0
}

async function dailyCreateUnits(h: Harness): Promise<number> {
  const row = await h.env.DB.prepare(
    `SELECT coalesce(sum(used), 0) AS n FROM daily_budget WHERE action = 'activityCreate'`,
  ).first<{ n: number }>()
  return row?.n ?? 0
}

describe('POST /api/activities by model revision', () => {
  it('accepts a digest of the current revision', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await post(h, token, create(digestFixture({ modelRevision: MODEL_REVISION })))
    expect(res.status).toBe(201)
  })

  it('refuses a stale revision with 409 app_outdated, before anything is written or charged', async () => {
    const h = createHarness()
    const token = await h.signIn()
    for (const revision of [1, MODEL_REVISION - 1]) {
      const res = await post(h, token, create(digestFixture({ modelRevision: revision })))
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ error: { code: 'app_outdated' } })
    }
    expect(await rows(h)).toBe(0)
    expect(await dailyCreateUnits(h)).toBe(0)
  })

  it('counts a digest with no usable revision as revision 1', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const { modelRevision: _dropped, ...legacy } = digestFixture()
    for (const revision of [undefined, null, 'six', 2.5, 0, -3]) {
      const digest = revision === undefined ? legacy : { ...legacy, modelRevision: revision }
      const res = await post(h, token, create(digest))
      expect(res.status, String(revision)).toBe(409)
      expect(await res.json()).toMatchObject({ error: { code: 'app_outdated' } })
    }
  })

  it('leaves a body with no digest object to the schema, as a malformed request', async () => {
    const h = createHarness()
    const token = await h.signIn()
    for (const body of [{}, { digest: 'x' }, { digest: null }, [], 'text']) {
      const res = await post(h, token, body)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: { code: 'invalid_request' } })
    }
  })

  it('still refuses a newer revision as a schema error, not as app_outdated', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await post(h, token, create(digestFixture({ modelRevision: MODEL_REVISION + 1 })))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'invalid_request' } })
  })

  it('refuses a stale replace and leaves the row alone', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const me = (await (await h.send({ path: '/api/me', ...as(token) })).json()) as {
      user: { id: string }
    }
    const id = await seedActivityRow(h.env.DB, {
      userId: me.user.id,
      revision: MODEL_REVISION - 1,
      fileHash: HASH,
    })
    const res = await post(h, token, create(digestFixture({ modelRevision: 2 })), `?replace=${id}`)
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: { code: 'app_outdated' } })
    const stored = await h.env.DB.prepare('SELECT digest_json FROM activities WHERE id = ?')
      .bind(id)
      .first<{ digest_json: string }>()
    expect(JSON.parse(stored!.digest_json).modelRevision).toBe(MODEL_REVISION - 1)
  })

  it('upgrades a seeded stale row to the current revision, charging no create unit', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const me = (await (await h.send({ path: '/api/me', ...as(token) })).json()) as {
      user: { id: string }
    }
    const id = await seedActivityRow(h.env.DB, { userId: me.user.id, revision: 1, fileHash: HASH })
    const res = await post(h, token, create(digestFixture({ modelRevision: MODEL_REVISION })))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id, digest: { modelRevision: MODEL_REVISION } })
    expect(await rows(h)).toBe(1)
    expect(await dailyCreateUnits(h)).toBe(0)
  })
})
