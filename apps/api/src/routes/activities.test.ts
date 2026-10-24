import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { describe, expect, it, vi } from 'vitest'
import {
  ACCOUNT_SCOPE_HEADER,
  ActivityDigestSchema,
  MAX_ACTIVITIES_PER_USER,
  MAX_DIGEST_BYTES,
  MAX_PAGE_BODY_BYTES,
  MAX_PAGE_DIGEST_BYTES,
  MAX_STORED_BYTES_PER_USER,
} from '@rca/contract'
import { activityFileKey } from '../storage.ts'
import { createHarness, digestFixture, START, testEnv, type Harness } from '../test/harness.ts'
import { sha256Hex, toBase64Url } from '../util.ts'
import { dedupeKeyFor } from './activities/shared.ts'

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
  // Most activity route tests exercise the paired R2 deployment. D1-only cases below opt out
  // explicitly by constructing a harness without FILES.
  if (h.env.FILES) {
    const enabled = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: true },
      ...as(token),
    })
    expect(enabled.status).toBe(200)
  }
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

  it('upgrades a stale digest only for the same original file and preserves file metadata', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token, {}, { modelRevision: 1 }))
    const uploaded = await h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: CONTENT,
      ...as(token),
    })
    expect(uploaded.status).toBe(200)
    const staleRow = await h.env.DB.prepare('SELECT digest_json FROM activities WHERE id = ?')
      .bind(id)
      .first<{ digest_json: string }>()
    const legacyDigest = JSON.parse(staleRow!.digest_json) as Record<string, unknown>
    delete legacyDigest.modelRevision
    await h.env.DB.prepare('UPDATE activities SET digest_json = ? WHERE id = ?')
      .bind(JSON.stringify(legacyDigest), id)
      .run()
    const before = await h.env.DB.prepare(
      'SELECT id, file_name, file_hash, file_key, file_size, created_at FROM activities WHERE id = ?',
    )
      .bind(id)
      .first<Record<string, unknown>>()

    const upgrade = await createActivity(
      h,
      token,
      { fileName: 'replacement-name.fit' },
      { modelRevision: MODEL_REVISION, name: 'Current analysis' },
    )
    expect(upgrade.status).toBe(200)
    expect(await upgrade.json()).toMatchObject({
      id,
      fileName: 'ride.fit',
      hasFile: true,
      fileSize: CONTENT.byteLength,
      digest: { modelRevision: MODEL_REVISION, name: 'Current analysis' },
    })
    const after = await h.env.DB.prepare(
      'SELECT id, file_name, file_hash, file_key, file_size, created_at FROM activities WHERE id = ?',
    )
      .bind(id)
      .first<Record<string, unknown>>()
    expect(after).toEqual(before)

    const downgrade = await createActivity(h, token, {}, { modelRevision: 1, name: 'Stale retry' })
    expect(downgrade.status).toBe(200)
    expect(
      ((await downgrade.json()) as { digest: { modelRevision: number } }).digest.modelRevision,
    ).toBe(MODEL_REVISION)

    const conflict = await createActivity(
      h,
      token,
      { fileHash: 'a'.repeat(64) },
      { modelRevision: MODEL_REVISION },
    )
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toMatchObject({ error: { code: 'activity_conflict' } })
  })

  it('atomically upgrades concurrent matching retries without downgrading the digest', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token, {}, { modelRevision: 1 }))
    const [first, second] = await Promise.all([
      createActivity(h, token, {}, { modelRevision: MODEL_REVISION, name: 'Current A' }),
      createActivity(h, token, {}, { modelRevision: MODEL_REVISION, name: 'Current B' }),
    ])
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(await idOf(first)).toBe(id)
    expect(await idOf(second)).toBe(id)
    const row = await h.env.DB.prepare('SELECT digest_json FROM activities WHERE id = ?')
      .bind(id)
      .first<{ digest_json: string }>()
    expect(JSON.parse(row!.digest_json).modelRevision).toBe(MODEL_REVISION)
    expect(await h.env.DB.prepare('SELECT COUNT(*) AS n FROM activities').first()).toEqual({ n: 1 })
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

  it('rejects a stale account scope before writing and preserves unscoped compatibility', async () => {
    const h = createHarness()
    const alice = await h.signIn('alice@example.com')
    const aliceId = await userId(h, alice)
    const bob = await h.signIn('bob@example.com')
    const mismatch = await h.send({
      method: 'POST',
      path: '/api/activities',
      json: {
        digest: digestFixture(),
        fileName: 'ride.fit',
        fileHash: HASH_OF_CONTENT,
      },
      headers: { [ACCOUNT_SCOPE_HEADER]: aliceId },
      ...as(bob),
    })
    expect(mismatch.status).toBe(409)
    expect(await mismatch.json()).toMatchObject({ error: { code: 'account_changed' } })
    expect(await h.env.DB.prepare('SELECT COUNT(*) AS n FROM activities').first()).toEqual({ n: 0 })

    const unscoped = await createActivity(h, bob)
    expect(unscoped.status).toBe(201)
  })
})

/**
 * The largest run digest the limits allow for a six-hour run: the most splits in both units, the
 * most heart-rate blocks, the most flags, the distance bests, and a realistic count of climb
 * sections. A run's own digest carries none, so the climbs are on top of what a run stores.
 */
function largestRunDigest(climbSections: number) {
  const digits = (base: number, step: number, i: number) => Number((base + step * i).toFixed(2))
  const split = (i: number, distanceM: number) => ({
    distanceM,
    seconds: digits(287.37, 0.0137, i),
    gradeAdjustedSeconds: digits(281.04, 0.0121, i),
    elevationGainM: Number((12.3 + 0.1 * (i % 7)).toFixed(1)),
    avgHeartRate: Number((151.2 + 0.1 * (i % 9)).toFixed(1)),
  })
  const flagMessage =
    'Heart rate read zero for over ten seconds, while the device was still recording the run'
  const heartBlocks = Array.from({ length: 70 }, (_, i) => ({
    heartRate: 128 + (i % 40),
    value: Math.PI * (i + 1) * 0.0371,
    terms: null,
  }))
  const sections = Array.from({ length: climbSections }, (_, i) => ({
    start: 1200 + 120 * i,
    end: 1320 + 120 * i,
    measuredW: 180.123456789 + i,
    terms: { gravityAccel: Math.PI * (i + 1), rolling: 4.123456789012345, aero: 0.9876543210987 },
  }))
  return digestFixture({
    sport: 'run',
    durationS: 21_600,
    distanceM: 40_000,
    elevationGainM: 1_213.4,
    maxHeartRate: 191,
    flags: Array.from({ length: 50 }, (_, i) => ({
      kind: 'hr-dropout',
      start: 300 + 400 * i,
      end: 330 + 400 * i,
      message: flagMessage,
    })),
    flagCounts: { 'hr-dropout': 50 },
    hrBlocks: heartBlocks,
    climbSections: sections,
    distanceBests: [
      { distanceM: 1000, seconds: 201.25 },
      { distanceM: 1609.344, seconds: 330.5 },
      { distanceM: 5000, seconds: 1098.75 },
      { distanceM: 10000, seconds: 2301.5 },
    ],
    splits: {
      km: Array.from({ length: 500 }, (_, i) => split(i, 1000)),
      mile: Array.from({ length: 320 }, (_, i) => split(i, 1609.344)),
    },
  })
}

describe('the largest run digest', () => {
  it('is accepted by the create route, and stays under the digest byte limit', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const bytesOf = (digest: Record<string, unknown>) =>
      new TextEncoder().encode(JSON.stringify(digest)).byteLength
    // A run stores no climb sections, so the first measurement is what the producer can write.
    const run = largestRunDigest(0)
    const withClimbs = largestRunDigest(150)
    const sizes = { run: bytesOf(run), withClimbs: bytesOf(withClimbs), limit: MAX_DIGEST_BYTES }
    expect(sizes.withClimbs).toBeLessThan(MAX_DIGEST_BYTES)
    expect(sizes.run).toBeLessThan(sizes.withClimbs)
    const res = await createActivity(h, token, {}, withClimbs)
    expect(res.status, JSON.stringify(sizes)).toBe(201)
  })
})

describe('GET /api/activities', () => {
  it('returns an empty list before any upload', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await h.send({ path: '/api/activities', ...as(token) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ items: [], nextCursor: null })
  })

  it('lists newest uploads first', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const first = await idOf(await createActivity(h, token, {}, { startMs: START }))
    h.clock.now += 1_000
    const second = await idOf(await createActivity(h, token, {}, { startMs: START + 7_200_000 }))
    h.clock.now += 1_000
    const third = await idOf(await createActivity(h, token, {}, { startMs: START + 3_600_000 }))
    const list = (await (await h.send({ path: '/api/activities', ...as(token) })).json()) as {
      items: { id: string }[]
    }
    expect(list.items.map((r) => r.id)).toEqual([third, second, first])
  })

  it('keeps splits from create to list, with unknown values as null', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const splits = {
      km: [
        {
          distanceM: 1000,
          seconds: 300.5,
          gradeAdjustedSeconds: null,
          elevationGainM: 12.3,
          avgHeartRate: 150.2,
        },
        {
          distanceM: 1000,
          seconds: null,
          gradeAdjustedSeconds: null,
          elevationGainM: null,
          avgHeartRate: null,
        },
      ],
      mile: [],
    }
    const created = await createActivity(h, token, {}, { sport: 'run', splits })
    expect(created.status).toBe(201)
    const list = (await (await h.send({ path: '/api/activities', ...as(token) })).json()) as {
      items: { digest: { splits?: unknown } }[]
    }
    expect(list.items[0]?.digest.splits).toEqual(splits)
  })

  it('parses legacy rows with no modelRevision as revision 1', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const row = await h.env.DB.prepare('SELECT digest_json FROM activities WHERE id = ?')
      .bind(id)
      .first<{ digest_json: string }>()
    const digest = JSON.parse(row!.digest_json) as Record<string, unknown>
    delete digest.modelRevision
    await h.env.DB.prepare('UPDATE activities SET digest_json = ? WHERE id = ?')
      .bind(JSON.stringify(digest), id)
      .run()

    const response = await h.send({ path: '/api/activities', ...as(token) })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ items: [{ id, digest: { modelRevision: 1 } }] })
  })

  it('lists but does not analyse a row from a newer model revision', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const row = await h.env.DB.prepare('SELECT digest_json FROM activities WHERE id = ?')
      .bind(id)
      .first<{ digest_json: string }>()
    const future = JSON.parse(row!.digest_json) as Record<string, unknown>
    future.modelRevision = MODEL_REVISION + 1
    await h.env.DB.prepare('UPDATE activities SET digest_json = ? WHERE id = ?')
      .bind(JSON.stringify(future), id)
      .run()

    const response = await h.send({ path: '/api/activities', ...as(token) })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      items: [{ id, digest: { modelRevision: MODEL_REVISION + 1 } }],
    })
    const unsupportedPost = await createActivity(
      h,
      token,
      {},
      { modelRevision: MODEL_REVISION + 1 },
    )
    expect(unsupportedPost.status).toBe(400)
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
    ).json()) as { items: { id: string }[] }
    expect(since.items.map((r) => r.id).sort()).toEqual([second, third].sort())
    const none = await h.send({ path: `/api/activities?since=${START + 99_999}`, ...as(token) })
    expect(await none.json()).toEqual({ items: [], nextCursor: null })
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
  it('blocks file writes and destructive operations that would discard file references without R2', async () => {
    const h = createHarness({}, { FILES: undefined })
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const uid = await userId(h, token)

    const upload = await h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: CONTENT,
      ...as(token),
    })
    expect(upload.status).toBe(503)
    expect(await upload.json()).toMatchObject({ error: { code: 'file_storage_unavailable' } })
    expect(
      await h.env.DB.prepare('SELECT file_key, file_size FROM activities WHERE id = ?')
        .bind(id)
        .first(),
    ).toEqual({ file_key: null, file_size: null })

    const key = activityFileKey(uid, id)
    await h.env.DB.prepare('UPDATE activities SET file_key = ?, file_size = ? WHERE id = ?')
      .bind(key, CONTENT.byteLength, id)
      .run()
    const download = await h.send({ path: `/api/activities/${id}/file`, ...as(token) })
    expect(download.status).toBe(503)
    const deletion = await h.send({ method: 'DELETE', path: `/api/activities/${id}`, ...as(token) })
    expect(deletion.status).toBe(503)
    expect(
      await h.env.DB.prepare('SELECT file_key, file_size FROM activities WHERE id = ?')
        .bind(id)
        .first(),
    ).toEqual({ file_key: key, file_size: CONTENT.byteLength })

    const metadataOnly = await idOf(await createActivity(h, token, {}, { startMs: START + 60_000 }))
    expect(
      (await h.send({ method: 'DELETE', path: `/api/activities/${metadataOnly}`, ...as(token) }))
        .status,
    ).toBe(204)
  })

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
    const stored = await h.env.FILES!.get(activityFileKey(uid, id))
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

  it('removes an R2 object when deleting an activity races an in-flight upload', async () => {
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
    const id = await idOf(await createActivity(h, token))
    const uid = await userId(h, token)

    const upload = h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: CONTENT,
      ...as(token),
    })
    await putStarted
    const deletion = await h.send({ method: 'DELETE', path: `/api/activities/${id}`, ...as(token) })
    expect(deletion.status).toBe(204)
    releasePut()

    const uploaded = await upload
    expect(uploaded.status).toBe(404)
    expect(await h.env.FILES!.get(activityFileKey(uid, id))).toBeNull()
  })

  it('does not restore file metadata when files are disabled during an in-flight upload', async () => {
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
    const id = await idOf(await createActivity(h, token))
    const uid = await userId(h, token)

    const upload = h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: CONTENT,
      ...as(token),
    })
    await putStarted
    const disabled = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: false },
      ...as(token),
    })
    expect(disabled.status).toBe(200)
    releasePut()

    expect((await upload).status).toBe(409)
    expect(await h.env.FILES!.get(activityFileKey(uid, id))).toBeNull()
    expect(
      await h.env.DB.prepare('SELECT file_key, file_size FROM activities WHERE id = ?')
        .bind(id)
        .first(),
    ).toEqual({ file_key: null, file_size: null })
  })

  it('does not roll back a successful same-activity upload when a parallel R2 write fails', async () => {
    let markFirstPutStarted!: () => void
    const firstPutStarted = new Promise<void>((resolve) => {
      markFirstPutStarted = resolve
    })
    let failFirstPut!: () => void
    const firstPutGate = new Promise<void>((resolve) => {
      failFirstPut = resolve
    })
    let puts = 0
    const files = new Proxy(testEnv().FILES!, {
      get(target, property) {
        if (property === 'put') {
          return async (...args: Parameters<R2Bucket['put']>) => {
            puts += 1
            if (puts === 1) {
              markFirstPutStarted()
              await firstPutGate
              throw new Error('simulated R2 write failure')
            }
            return target.put(...args)
          }
        }
        const value = Reflect.get(target, property, target) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const h = createHarness({}, { FILES: files })
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const uid = await userId(h, token)
    const failed = h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: CONTENT,
      ...as(token),
    })
    await firstPutStarted

    const succeeded = await h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: CONTENT,
      ...as(token),
    })
    expect(succeeded.status).toBe(200)
    failFirstPut()
    expect((await failed).status).toBe(500)
    expect(await h.env.FILES!.get(activityFileKey(uid, id))).not.toBeNull()
    expect(
      await h.env.DB.prepare('SELECT file_key, file_size FROM activities WHERE id = ?')
        .bind(id)
        .first(),
    ).toEqual({ file_key: activityFileKey(uid, id), file_size: CONTENT.byteLength })
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
    expect(await h.env.FILES!.get(activityFileKey(uid, id))).toBeNull()
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
    expect(await h.env.FILES!.get(activityFileKey(uid, id))).toBeNull()
    const list = (await (await h.send({ path: '/api/activities', ...as(token) })).json()) as {
      items: { hasFile: boolean }[]
    }
    expect(list.items[0]?.hasFile).toBe(false)
  })

  it('returns the record that won a concurrent upload of the same activity', async () => {
    let harness: Harness | undefined
    let racing = false
    const h = createHarness({
      randomUUID: () => {
        // Runs after the duplicate check and before the insert: another request lands first.
        if (racing && harness) {
          racing = false
          void harness.env.DB.batch([
            harness.env.DB.prepare(
              `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
                digest_json, file_name, file_hash, created_at)
               SELECT 'winner', id, ?, 'ride', ?, 'Morning ride', 1, ?, 'ride.fit', ?, 0
               FROM users LIMIT 1`,
            ).bind(`ride-${START / 1000}`, START, JSON.stringify(digestFixture()), HASH_OF_CONTENT),
            harness.env.DB.prepare('UPDATE users SET activity_count = activity_count + 1'),
          ])
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
    expect(await h.env.FILES!.get(activityFileKey(uid, id))).toBeNull()
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
    await h.env.FILES!.delete(activityFileKey(await userId(h, token), id))
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
    expect(await h.env.FILES!.get(activityFileKey(uid, id))).toBeNull()
    expect(await (await h.send({ path: '/api/activities', ...as(token) })).json()).toEqual({
      items: [],
      nextCursor: null,
    })
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
    expect(await (await h.send({ path: '/api/activities', ...as(bob) })).json()).toEqual({
      items: [],
      nextCursor: null,
    })

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
      items: { id: string; hasFile: boolean }[]
    }
    expect(alicesList.items).toMatchObject([{ id, hasFile: true }])
    expect(await h.env.FILES!.get(activityFileKey(aliceId, id))).not.toBeNull()
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

describe('GET /api/activities paging', () => {
  it('returns newest uploads first with a nextCursor only when more pages exist', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const ids: string[] = []
    for (let i = 0; i < 5; i += 1) {
      h.clock.now += 1_000
      ids.push(await idOf(await createActivity(h, token, {}, { startMs: START + i * 60_000 })))
    }
    const page1 = await pageOf(h, token, '?limit=2')
    expect(page1.items.map((r) => r.id)).toEqual([ids[4], ids[3]])
    expect(page1.nextCursor).not.toBeNull()
    const page2 = await pageOf(h, token, `?limit=2&cursor=${page1.nextCursor}`)
    expect(page2.items.map((r) => r.id)).toEqual([ids[2], ids[1]])
    const page3 = await pageOf(h, token, `?limit=2&cursor=${page2.nextCursor}`)
    expect(page3.items.map((r) => r.id)).toEqual([ids[0]])
    expect(page3.nextCursor).toBeNull()
  })

  it('pages through records created in the same millisecond without skipping any', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const ids = [
      await idOf(await createActivity(h, token, {}, { startMs: START })),
      await idOf(await createActivity(h, token, {}, { startMs: START + 60_000 })),
      await idOf(await createActivity(h, token, {}, { startMs: START + 120_000 })),
    ]
    const seen: string[] = []
    let cursor: string | null | undefined
    do {
      const page = await pageOf(h, token, `?limit=1${cursor ? `&cursor=${cursor}` : ''}`)
      seen.push(...page.items.map((r) => r.id))
      cursor = page.nextCursor
    } while (cursor)
    expect([...seen].sort()).toEqual([...ids].sort())
    expect(new Set(seen).size).toBe(3)
  })

  it('defaults to 25 records a page and rejects limits outside 1 to 25', async () => {
    const h = createHarness()
    const token = await h.signIn()
    for (let index = 0; index < 26; index += 1) {
      await createActivity(h, token, {}, { startMs: START + index * 60_000 })
    }
    const defaultPage = await pageOf(h, token, '')
    expect(defaultPage.items).toHaveLength(25)
    expect(defaultPage.nextCursor).not.toBeNull()
    for (const limit of ['0', '26', '1001', 'abc', '1.5']) {
      const res = await h.send({
        path: `/api/activities?limit=${limit}`,
        cookies: { rca_session: token },
      })
      expect(res.status, limit).toBe(400)
    }
    expect(
      (await h.send({ path: '/api/activities?limit=25', cookies: { rca_session: token } })).status,
    ).toBe(200)
  })

  it('caps digest bytes per response without skipping, duplicating, or reordering records', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const ids: string[] = []
    const largeMessage = 'x'.repeat(259_000)
    for (let index = 0; index < 7; index += 1) {
      h.clock.now += 1_000
      ids.push(
        await idOf(
          await createActivity(
            h,
            token,
            { fileName: 'é'.repeat(255) },
            {
              startMs: START + index * 60_000,
              flags: [{ kind: 'hr-spike', start: 0, end: 1, message: largeMessage }],
            },
          ),
        ),
      )
    }

    const seen: string[] = []
    let cursor: string | null = null
    const pageSizes: number[] = []
    do {
      const page = await pageOf(h, token, `?limit=25${cursor ? `&cursor=${cursor}` : ''}`)
      expect(new TextEncoder().encode(JSON.stringify(page)).byteLength).toBeLessThanOrEqual(
        MAX_PAGE_BODY_BYTES,
      )
      pageSizes.push(page.items.length)
      const digestBytes = page.items.reduce(
        (sum, record) => sum + new TextEncoder().encode(JSON.stringify(record.digest)).byteLength,
        0,
      )
      expect(digestBytes).toBeLessThanOrEqual(MAX_PAGE_DIGEST_BYTES)
      seen.push(...page.items.map((record) => record.id))
      cursor = page.nextCursor
    } while (cursor)

    expect(pageSizes[0]).toBeLessThan(7)
    expect(seen).toEqual([...ids].reverse())
    expect(new Set(seen).size).toBe(ids.length)
  })

  it('rejects cursors that were not issued by the server', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const forged = toBase64Url(new TextEncoder().encode('not a cursor'))
    for (const cursor of ['bad+cursor', forged]) {
      const res = await h.send({
        path: `/api/activities?cursor=${cursor}`,
        cookies: { rca_session: token },
      })
      expect(res.status, cursor).toBe(400)
      expect(await res.json()).toMatchObject({ error: { code: 'invalid_request' } })
    }
  })

  it('never returns another user records through a cursor', async () => {
    const h = createHarness()
    const alice = await h.signIn('alice@example.com', 'Alice')
    const bob = await h.signIn('bob@example.com', 'Bob')
    await createActivity(h, alice, {}, { startMs: START })
    const bobId = await idOf(await createActivity(h, bob, {}, { startMs: START + 1_000_000 }))
    const page = await pageOf(h, alice, '?limit=1')
    expect(page.items).toHaveLength(1)
    expect(page.items.map((r) => r.id)).not.toContain(bobId)
  })
})

describe('per-user quotas', () => {
  it('refuses a new activity past the count cap with 403, but still returns an existing one', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const existing = await idOf(await createActivity(h, token))
    const uid = await userId(h, token)
    await seedActivities(h, uid, MAX_ACTIVITIES_PER_USER - 1)

    const refused = await createActivity(h, token, {}, { startMs: START + 3_600_000 })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ error: { code: 'activity_quota' } })
    expect(
      await h.env.DB.prepare('SELECT COUNT(*) AS n FROM activities WHERE user_id = ?')
        .bind(uid)
        .first<{ n: number }>(),
    ).toEqual({ n: MAX_ACTIVITIES_PER_USER })

    const again = await createActivity(h, token)
    expect(again.status).toBe(200)
    expect(await idOf(again)).toBe(existing)
  })

  it('checks the activity count atomically when another request takes the last slot', async () => {
    let harness: Harness | undefined
    let racing = false
    let competitorInsert: Promise<unknown> | undefined
    const h = createHarness({
      randomUUID: () => {
        if (racing && harness) {
          racing = false
          competitorInsert = harness.env.DB.batch([
            harness.env.DB.prepare(
              `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
                digest_json, file_name, file_hash, created_at)
               SELECT 'last-slot-winner', id, 'last-slot-winner', 'run', 1, 'winner', 1, '{}',
                 'winner.fit', 'hash', 0 FROM users LIMIT 1`,
            ),
            harness.env.DB.prepare('UPDATE users SET activity_count = activity_count + 1'),
          ])
        }
        return 'quota-racer'
      },
    })
    harness = h
    const token = await h.signIn()
    const uid = await userId(h, token)
    await seedActivities(h, uid, MAX_ACTIVITIES_PER_USER - 1)

    racing = true
    const refused = await createActivity(h, token, {}, { startMs: START + 3_600_000 })
    await competitorInsert
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ error: { code: 'activity_quota' } })
    expect(
      await h.env.DB.prepare('SELECT COUNT(*) AS n FROM activities WHERE user_id = ?')
        .bind(uid)
        .first<{ n: number }>(),
    ).toEqual({ n: MAX_ACTIVITIES_PER_USER })
  })

  it('refuses a file that would take the user past the byte cap, and counts a replacement once', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    const small = new TextEncoder().encode('0123456789')
    const big = new TextEncoder().encode('01234567890')
    const fits = await idOf(await createActivity(h, token, { fileHash: await sha256Hex(small) }))
    const over = await idOf(
      await createActivity(
        h,
        token,
        { fileHash: await sha256Hex(big) },
        { startMs: START + 3_600_000 },
      ),
    )
    await h.env.DB.prepare(
      `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
        digest_json, file_name, file_hash, file_size, created_at)
       VALUES ('filler', ?, 'filler', 'run', 1, 'filler', 1, '{}', 'f.fit', 'h', ?, 0)`,
    )
      .bind(uid, MAX_STORED_BYTES_PER_USER - small.byteLength)
      .run()

    const refused = await h.send({
      method: 'PUT',
      path: `/api/activities/${over}/file`,
      raw: big,
      cookies: { rca_session: token },
    })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ error: { code: 'storage_quota' } })
    expect(await h.env.FILES!.get(activityFileKey(uid, over))).toBeNull()

    const stored = await h.send({
      method: 'PUT',
      path: `/api/activities/${fits}/file`,
      raw: small,
      cookies: { rca_session: token },
    })
    expect(stored.status).toBe(200)
    const replaced = await h.send({
      method: 'PUT',
      path: `/api/activities/${fits}/file`,
      raw: small,
      cookies: { rca_session: token },
    })
    expect(replaced.status).toBe(200)
  })

  it('reserves storage before R2 so concurrent uploads cannot exceed the byte cap', async () => {
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
    const uid = await userId(h, token)
    const firstId = await idOf(await createActivity(h, token))
    const secondId = await idOf(await createActivity(h, token, {}, { startMs: START + 3_600_000 }))
    await h.env.DB.prepare(
      `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
        digest_json, file_name, file_hash, file_size, created_at)
       VALUES ('filler', ?, 'filler', 'run', 1, 'filler', 1, '{}', 'f.fit', 'h', ?, 0)`,
    )
      .bind(uid, MAX_STORED_BYTES_PER_USER - CONTENT.byteLength)
      .run()

    const first = h.send({
      method: 'PUT',
      path: `/api/activities/${firstId}/file`,
      raw: CONTENT,
      ...as(token),
    })
    await putStarted
    const second = await h.send({
      method: 'PUT',
      path: `/api/activities/${secondId}/file`,
      raw: CONTENT,
      ...as(token),
    })
    expect(second.status).toBe(403)
    expect(await second.json()).toMatchObject({ error: { code: 'storage_quota' } })
    releasePut()
    expect((await first).status).toBe(200)
  })

  it('keeps a failed upload reservation while a parallel same-activity retry is pending', async () => {
    let markFirstPutStarted!: () => void
    const firstPutStarted = new Promise<void>((resolve) => {
      markFirstPutStarted = resolve
    })
    let failFirstPut!: () => void
    const firstPutGate = new Promise<void>((resolve) => {
      failFirstPut = resolve
    })
    let markSecondPutStarted!: () => void
    const secondPutStarted = new Promise<void>((resolve) => {
      markSecondPutStarted = resolve
    })
    let finishSecondPut!: () => void
    const secondPutGate = new Promise<void>((resolve) => {
      finishSecondPut = resolve
    })
    let puts = 0
    const files = new Proxy(testEnv().FILES!, {
      get(target, property) {
        if (property === 'put') {
          return async (...args: Parameters<R2Bucket['put']>) => {
            puts += 1
            if (puts === 1) {
              markFirstPutStarted()
              await firstPutGate
              throw new Error('simulated R2 failure')
            }
            if (puts === 2) {
              markSecondPutStarted()
              await secondPutGate
            }
            return target.put(...args)
          }
        }
        const value = Reflect.get(target, property, target) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const h = createHarness({}, { FILES: files })
    const token = await h.signIn()
    const uid = await userId(h, token)
    const firstId = await idOf(await createActivity(h, token))
    const thirdId = await idOf(await createActivity(h, token, {}, { startMs: START + 3_600_000 }))
    await h.env.DB.prepare(
      `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
        digest_json, file_name, file_hash, file_size, created_at)
       VALUES ('filler', ?, 'filler', 'run', 1, 'filler', 1, '{}', 'f.fit', 'h', ?, 0)`,
    )
      .bind(uid, MAX_STORED_BYTES_PER_USER - CONTENT.byteLength)
      .run()

    const first = h.send({
      method: 'PUT',
      path: `/api/activities/${firstId}/file`,
      raw: CONTENT,
      ...as(token),
    })
    await firstPutStarted
    const retry = h.send({
      method: 'PUT',
      path: `/api/activities/${firstId}/file`,
      raw: CONTENT,
      ...as(token),
    })
    await secondPutStarted
    failFirstPut()
    expect((await first).status).toBe(500)
    const third = await h.send({
      method: 'PUT',
      path: `/api/activities/${thirdId}/file`,
      raw: CONTENT,
      ...as(token),
    })
    finishSecondPut()
    expect((await retry).status).toBe(200)

    expect(third.status).toBe(403)
    expect(await third.json()).toMatchObject({ error: { code: 'storage_quota' } })
    expect(puts).toBe(2)
    expect(
      await h.env.DB.prepare('SELECT sum(file_size) AS total FROM activities WHERE user_id = ?')
        .bind(uid)
        .first<{ total: number }>(),
    ).toEqual({ total: MAX_STORED_BYTES_PER_USER })
  })
})

async function pageOf(h: Harness, token: string, query: string) {
  const res = await h.send({ path: `/api/activities${query}`, cookies: { rca_session: token } })
  expect(res.status).toBe(200)
  return (await res.json()) as {
    items: { id: string; digest: unknown }[]
    nextCursor: string | null
  }
}

/** Inserts filler activities in one statement. Only the count matters to the quota. */
async function seedActivities(h: Harness, uid: string, count: number): Promise<void> {
  await h.env.DB.batch([
    h.env.DB.prepare(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
       INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
         digest_json, file_name, file_hash, created_at)
       SELECT 'seed-' || i, ?, 'seed-' || i, 'run', i, 'seed', 1, '{}', 'seed.fit', 'h', 0 FROM n`,
    ).bind(count, uid),
    h.env.DB.prepare('UPDATE users SET activity_count = activity_count + ? WHERE id = ?').bind(
      count,
      uid,
    ),
  ])
}

describe('activity count cap', () => {
  it('caps creates by the stored per-user counter, not by counting rows', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    await h.env.DB.prepare('UPDATE users SET activity_count = ? WHERE id = ?')
      .bind(MAX_ACTIVITIES_PER_USER, uid)
      .run()

    const refused = await createActivity(h, token)
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ error: { code: 'activity_quota' } })
  })

  it('keeps the counter equal to the number of rows through creates and deletes', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    const first = await idOf(await createActivity(h, token))
    await idOf(await createActivity(h, token, {}, { startMs: START + 60_000 }))
    await h.send({ method: 'DELETE', path: `/api/activities/${first}`, ...as(token) })
    await h.send({ method: 'DELETE', path: `/api/activities/${first}`, ...as(token) })

    expect(
      await h.env.DB.prepare(
        `SELECT activity_count, (SELECT COUNT(*) FROM activities WHERE user_id = users.id) AS rows
         FROM users WHERE id = ?`,
      )
        .bind(uid)
        .first(),
    ).toEqual({ activity_count: 1, rows: 1 })
  })
})

describe('original file reservations', () => {
  it('releases the byte reservation when the monthly R2 budget refuses the write before R2 is called', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    await h.env.DB.prepare(
      `INSERT INTO r2_storage_budget (id, lifetime_put_bytes, monthly_period, monthly_operations, monthly_put_bytes)
       VALUES (1, 0, '2026-01', 0, ${2 * 1024 * 1024 * 1024})
       ON CONFLICT(id) DO UPDATE SET monthly_period = '2026-01', monthly_operations = 0,
         monthly_put_bytes = ${2 * 1024 * 1024 * 1024}`,
    ).run()
    await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: true },
      ...as(token),
    })

    const refused = await h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: CONTENT,
      ...as(token),
    })
    expect(refused.status).toBe(429)
    expect(await refused.json()).toMatchObject({ error: { code: 'storage_budget_exhausted' } })
    expect(
      await h.env.DB.prepare('SELECT file_key, file_size FROM activities WHERE id = ?')
        .bind(id)
        .first(),
    ).toEqual({ file_key: null, file_size: null })
  })

  it('returns 204 when an activity is deleted and its R2 object cannot be removed, and never leaves the row behind', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const brokenDelete = new Proxy(testEnv().FILES!, {
      get(target, property) {
        if (property === 'delete')
          return async () => {
            throw new Error('simulated R2 delete failure')
          }
        const value = Reflect.get(target, property, target) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const broken = createHarness({}, { FILES: brokenDelete })
    const res = await broken.send({ method: 'DELETE', path: `/api/activities/${id}`, ...as(token) })
    expect(res.status).toBe(204)
    expect(
      await h.env.DB.prepare('SELECT COUNT(*) AS n FROM activities WHERE id = ?')
        .bind(id)
        .first<{ n: number }>(),
    ).toEqual({ n: 0 })
    spy.mockRestore()
  })
})

/** Bytes the server stores for a digest with this name: the JSON it re-serialises after parsing. */
function storedDigestBytes(name: string): number {
  const wire = JSON.parse(JSON.stringify(digestFixture({ name })))
  return new TextEncoder().encode(JSON.stringify(ActivityDigestSchema.parse(wire))).byteLength
}

describe('boundary pins', () => {
  it('derives the dedupe key by rounding to the nearest second, half up', () => {
    expect(dedupeKeyFor('ride', 1_499)).toBe('ride-1')
    expect(dedupeKeyFor('ride', 1_500)).toBe('ride-2')
    expect(dedupeKeyFor('run', 2_499)).toBe('run-2')
  })

  it('accepts a digest of exactly 256 KB and refuses one byte more', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const sizeWithName = (name: string) => storedDigestBytes(name)
    const base = sizeWithName('')
    const exact = await createActivity(h, token, {}, { name: 'n'.repeat(MAX_DIGEST_BYTES - base) })
    expect(exact.status).toBe(201)
    const over = await createActivity(
      h,
      token,
      {},
      { name: 'n'.repeat(MAX_DIGEST_BYTES - base + 1), startMs: START + 60_000 },
    )
    expect(over.status).toBe(413)
    expect(await over.json()).toMatchObject({ error: { code: 'digest_too_large' } })
  })

  it('fills a page exactly to its digest byte budget, and includes the row that exactly fits', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const base = storedDigestBytes('')
    const each = MAX_DIGEST_BYTES
    expect(MAX_PAGE_DIGEST_BYTES % each).toBe(0)
    for (let i = 0; i < MAX_PAGE_DIGEST_BYTES / each; i += 1) {
      h.clock.now += 1_000
      const res = await createActivity(
        h,
        token,
        {},
        { name: 'n'.repeat(each - base), startMs: START + i * 60_000 },
      )
      expect(res.status).toBe(201)
    }
    const page = await pageOf(h, token, '?limit=25')
    expect(page.items).toHaveLength(MAX_PAGE_DIGEST_BYTES / each)
    expect(page.nextCursor).toBeNull()
    expect(MAX_PAGE_BODY_BYTES).toBeGreaterThan(MAX_PAGE_DIGEST_BYTES)
  })
})

describe('stored digests from older revisions', () => {
  it('lists an old-revision row that create would refuse, and answers a same-revision create with it', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await createActivity(h, token)
    await h.env.DB.prepare('DELETE FROM activities').run()
    const base = digestFixture({ modelRevision: 1 })
    const legacy = {
      ...base,
      durationS: null,
      curve: (base.curve as Record<string, unknown>[])
        .slice(0, 3)
        .map((point) => Object.assign({}, point, { durationS: 7 })),
    }
    await h.env.DB.prepare(
      `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
        digest_json, file_name, file_hash, created_at)
       SELECT 'legacy', id, ?, 'ride', ?, 'Old ride', 1, ?, 'old.fit', ?, 0
       FROM users LIMIT 1`,
    )
      .bind(`ride-${START / 1000}`, START, JSON.stringify(legacy), HASH_OF_CONTENT)
      .run()

    const list = await h.send({ path: '/api/activities', cookies: { rca_session: token } })
    expect(list.status).toBe(200)
    const page = (await list.json()) as { items: { id: string }[]; unreadable?: number }
    expect(page.items.map((item) => item.id)).toEqual(['legacy'])
    expect(page.unreadable).toBeUndefined()

    const again = await createActivity(h, token, {}, { modelRevision: 1 })
    expect(again.status).toBe(200)
    expect(await again.json()).toMatchObject({ id: 'legacy' })
  })
})
