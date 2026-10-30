import { describe, expect, it } from 'vitest'
import {
  ApiErrorSchema,
  DAILY_UPLOAD_BYTES,
  MAX_FILE_BYTES,
  MAX_MONTHLY_R2_PUT_BYTES,
  MAX_STORED_BYTES_PER_USER,
} from '@rca/contract'
import { createHarness, digestFixture, START, testEnv, type Harness } from '../test/harness.ts'
import { activityFileKey } from '../storage.ts'
import { sha256Hex } from '../util.ts'

const CONTENT = new TextEncoder().encode('0123 fake FIT bytes')
const HASH_OF_CONTENT = await sha256Hex(CONTENT)
const DAY = new Date(START).toISOString().slice(0, 10)

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

/**
 * Sends the file body as given. The harness does not add a Content-Length, and the upload route
 * requires one, so these tests send their own headers and bodies.
 */
async function putFile(
  h: Harness,
  token: string,
  id: string,
  body: BodyInit,
  headers: Record<string, string>,
): Promise<Response> {
  return h.app.request(
    `/api/activities/${id}/file`,
    {
      method: 'PUT',
      headers: { 'X-RCA-Client': 'web', cookie: `rca_session=${token}`, ...headers },
      body,
      duplex: 'half',
    } as RequestInit,
    h.env,
  )
}

function lengthOf(bytes: Uint8Array): Record<string, string> {
  return { 'content-length': String(bytes.byteLength) }
}

/** A body that counts how often the server pulls data from it. Nothing is pulled until read. */
function trackedBody(bytes: Uint8Array): { body: ReadableStream<Uint8Array>; pulls: () => number } {
  let pulls = 0
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls += 1
        controller.enqueue(bytes)
        controller.close()
      },
    },
    { highWaterMark: 0 },
  )
  return { body, pulls: () => pulls }
}

/** Counts the R2 PUT calls made through the bucket. */
function countingFiles(): { files: R2Bucket; puts: () => number } {
  let puts = 0
  const files = new Proxy(testEnv().FILES!, {
    get(target, property) {
      if (property === 'put') {
        return async (...args: Parameters<R2Bucket['put']>) => {
          puts += 1
          return target.put(...args)
        }
      }
      const value = Reflect.get(target, property, target) as unknown
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return { files, puts: () => puts }
}

async function ledger(h: Harness) {
  return h.env.DB.prepare(
    'SELECT lifetime_put_bytes, monthly_put_bytes FROM r2_storage_budget WHERE id = 1',
  ).first<{ lifetime_put_bytes: number; monthly_put_bytes: number }>()
}

async function dailyUsed(h: Harness, uid: string, action: string): Promise<number> {
  const row = await h.env.DB.prepare(
    'SELECT used FROM daily_budget WHERE user_id = ? AND day = ? AND action = ?',
  )
    .bind(uid, DAY, action)
    .first<{ used: number }>()
  return row?.used ?? 0
}

async function storedRow(h: Harness, id: string) {
  return h.env.DB.prepare('SELECT file_key, file_size FROM activities WHERE id = ?')
    .bind(id)
    .first<{ file_key: string | null; file_size: number | null }>()
}

describe('upload Content-Length', () => {
  it('refuses a file sent without a Content-Length with 411, before reading the body', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const { body, pulls } = trackedBody(CONTENT)
    const res = await putFile(h, token, id, body, {})
    expect(res.status).toBe(411)
    expect(await res.json()).toMatchObject({ error: { code: 'length_required' } })
    expect(pulls()).toBe(0)
    expect(await storedRow(h, id)).toEqual({ file_key: null, file_size: null })
  })

  it.each(['abc', '-1', '1.5', '1e3'])(
    'refuses Content-Length %s with 400 before reading the body',
    async (value) => {
      const h = createHarness()
      const token = await h.signIn()
      const id = await idOf(await createActivity(h, token))
      const { body, pulls } = trackedBody(CONTENT)
      const res = await putFile(h, token, id, body, { 'content-length': value })
      expect(res.status).toBe(400)
      expect(pulls()).toBe(0)
      expect(await storedRow(h, id)).toEqual({ file_key: null, file_size: null })
    },
  )

  it('refuses a Content-Length over 50 MB with 413 before reading the body', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const { body, pulls } = trackedBody(CONTENT)
    const res = await putFile(h, token, id, body, { 'content-length': String(MAX_FILE_BYTES + 1) })
    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({ error: { code: 'payload_too_large' } })
    expect(pulls()).toBe(0)
  })

  it('refuses a body longer than its Content-Length with 400 and stores nothing', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const longer = new Uint8Array([...CONTENT, 1, 2, 3])
    const res = await putFile(h, token, id, longer, lengthOf(CONTENT))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'length_mismatch' } })
    expect(await storedRow(h, id)).toEqual({ file_key: null, file_size: null })
  })

  it('refuses a body shorter than its Content-Length with 400 and stores nothing', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const res = await putFile(h, token, id, CONTENT, {
      'content-length': String(CONTENT.byteLength + 4),
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'length_mismatch' } })
    expect(await storedRow(h, id)).toEqual({ file_key: null, file_size: null })
  })
})

describe('repeat uploads', () => {
  it('answers a repeat of a stored file with 200 without reading the body or charging any budget', async () => {
    const { files, puts } = countingFiles()
    const h = createHarness({}, { FILES: files })
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const uid = await userId(h, token)
    expect((await putFile(h, token, id, CONTENT, lengthOf(CONTENT))).status).toBe(200)
    const ledgerBefore = await ledger(h)
    const countBefore = await dailyUsed(h, uid, 'fileUpload')
    const bytesBefore = await dailyUsed(h, uid, 'uploadBytes')
    const putsBefore = puts()

    for (let repeat = 0; repeat < 20; repeat += 1) {
      const { body, pulls } = trackedBody(CONTENT)
      const again = await putFile(h, token, id, body, lengthOf(CONTENT))
      expect(again.status).toBe(200)
      expect(await again.json()).toMatchObject({ id, hasFile: true, fileSize: CONTENT.byteLength })
      expect(pulls()).toBe(0)
    }

    expect(await ledger(h)).toEqual(ledgerBefore)
    expect(await dailyUsed(h, uid, 'fileUpload')).toBe(countBefore)
    expect(await dailyUsed(h, uid, 'uploadBytes')).toBe(bytesBefore)
    expect(puts()).toBe(putsBefore)
    expect(await h.env.DB.prepare('SELECT COUNT(*) AS n FROM upload_slots').first()).toEqual({
      n: 0,
    })
  })

  it('does not clear the size a concurrent upload stored when the slower upload rolls back', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const uid = await userId(h, token)
    // Same length, different bytes: the slow request reserves the size, then fails its hash.
    const tampered = new Uint8Array(CONTENT.byteLength).fill(0x58)
    let openGate: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (openGate = resolve))
    let reachGate: () => void = () => undefined
    const reached = new Promise<void>((resolve) => (reachGate = resolve))
    const slowBody = new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          reachGate()
          await gate
          controller.enqueue(tampered)
          controller.close()
        },
      },
      { highWaterMark: 0 },
    )
    const slow = putFile(h, token, id, slowBody, lengthOf(CONTENT))
    await reached

    const fast = await putFile(h, token, id, CONTENT, lengthOf(CONTENT))
    expect(fast.status).toBe(200)
    openGate()
    expect((await slow).status).toBe(422)
    expect(await storedRow(h, id)).toEqual({
      file_key: activityFileKey(uid, id),
      file_size: CONTENT.byteLength,
    })
  })

  it('refuses a repeat whose length differs from the stored file, and leaves the file and ledger alone', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    expect((await putFile(h, token, id, CONTENT, lengthOf(CONTENT))).status).toBe(200)
    const stored = await storedRow(h, id)
    const ledgerBefore = await ledger(h)

    const other = new Uint8Array(CONTENT.byteLength + 1)
    const res = await putFile(h, token, id, other, lengthOf(other))
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: { code: 'hash_mismatch' } })
    expect(await storedRow(h, id)).toEqual(stored)
    expect(await ledger(h)).toEqual(ledgerBefore)
  })

  it('charges the stored bytes against the day, and refuses past the 1 GiB daily upload budget', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const uid = await userId(h, token)
    expect((await putFile(h, token, id, CONTENT, lengthOf(CONTENT))).status).toBe(200)
    expect(await dailyUsed(h, uid, 'uploadBytes')).toBe(CONTENT.byteLength)

    await h.env.DB.prepare(
      'UPDATE daily_budget SET used = ? WHERE user_id = ? AND day = ? AND action = ?',
    )
      .bind(DAILY_UPLOAD_BYTES - 10, uid, DAY, 'uploadBytes')
      .run()
    const second = await idOf(await createActivity(h, token, {}, { startMs: START + 3_600_000 }))
    const { body, pulls } = trackedBody(CONTENT)
    const refused = await putFile(h, token, second, body, lengthOf(CONTENT))
    expect(refused.status).toBe(429)
    expect(await refused.json()).toMatchObject({ error: { code: 'daily_limit' } })
    expect(refused.headers.get('retry-after')).not.toBeNull()
    expect(pulls()).toBe(0)
    expect(await storedRow(h, second)).toEqual({ file_key: null, file_size: null })
    expect(await dailyUsed(h, uid, 'fileUpload')).toBe(1)
  })
})

/**
 * A D1 binding that holds the first statement matching `pattern` until `release` resolves. `reached`
 * runs as the statement is about to execute, so a test can start a rival request while it waits.
 */
function holdFirstMatch(
  target: D1Database,
  pattern: RegExp,
  release: Promise<void>,
  reached: () => void,
): D1Database {
  let holding = false
  return new Proxy(target, {
    get(obj, prop) {
      if (prop !== 'prepare') {
        const value: unknown = Reflect.get(obj, prop, obj)
        return typeof value === 'function' ? value.bind(obj) : value
      }
      return (query: string) => {
        const statement = obj.prepare(query)
        if (!pattern.test(query)) return statement
        return new Proxy(statement, {
          get(stmt, method) {
            const value: unknown = Reflect.get(stmt, method, stmt)
            if (method !== 'bind' || typeof value !== 'function') return value
            return (...args: unknown[]) => {
              const bound: unknown = Reflect.apply(value, stmt, args)
              return new Proxy(bound as object, {
                get(bound, run) {
                  const execute: unknown = Reflect.get(bound, run, bound)
                  if (typeof execute !== 'function') return execute
                  if (run !== 'run' && run !== 'all' && run !== 'raw' && run !== 'first') {
                    return execute.bind(bound)
                  }
                  return async (...runArgs: unknown[]) => {
                    if (!holding) {
                      holding = true
                      reached()
                      await release
                    }
                    return Reflect.apply(execute, bound, runArgs)
                  }
                },
              })
            }
          },
        })
      }
    },
  })
}

describe('upload reservations', () => {
  it('does not let a same-length upload with other bytes clear a reservation that is still in use', async () => {
    let reachHeld!: () => void
    const held = new Promise<void>((resolve) => (reachHeld = resolve))
    let releaseHeld!: () => void
    const heldGate = new Promise<void>((resolve) => (releaseHeld = resolve))
    const h = createHarness(
      {},
      { DB: holdFirstMatch(testEnv().DB, /^update\b.*\bfile_size\b/i, heldGate, reachHeld) },
    )
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const uid = await userId(h, token)

    // The wrong-bytes request snapshots the activity before any reservation, then stops just
    // before it reserves the size.
    const tampered = new Uint8Array(CONTENT.byteLength).fill(0x58)
    const wrong = putFile(h, token, id, tampered, lengthOf(tampered))
    await held

    // The correct-bytes request reserves the same size, then waits while its body arrives.
    let openGate: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (openGate = resolve))
    let reachGate: () => void = () => undefined
    const reached = new Promise<void>((resolve) => (reachGate = resolve))
    const slowBody = new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          reachGate()
          await gate
          controller.enqueue(CONTENT)
          controller.close()
        },
      },
      { highWaterMark: 0 },
    )
    const correct = putFile(h, token, id, slowBody, lengthOf(CONTENT))
    await reached
    expect(await storedRow(h, id)).toEqual({
      file_key: null,
      file_size: CONTENT.byteLength,
    })

    // The wrong-bytes request now reserves, reads its body, fails the hash, and gives back.
    releaseHeld()
    expect((await wrong).status).toBe(422)
    expect(await storedRow(h, id)).toEqual({
      file_key: null,
      file_size: CONTENT.byteLength,
    })

    openGate()
    expect((await correct).status).toBe(200)
    expect(await storedRow(h, id)).toEqual({
      file_key: activityFileKey(uid, id),
      file_size: CONTENT.byteLength,
    })
  })

  it('lets an upload take over a reservation whose upload slot has expired', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const uid = await userId(h, token)
    // A request that reserved and then crashed: its reservation token names a slot that is gone.
    await h.env.DB.prepare(
      "UPDATE activities SET file_size = ?, file_reservation_token = 'crashed-request' WHERE id = ?",
    )
      .bind(CONTENT.byteLength, id)
      .run()

    expect((await putFile(h, token, id, CONTENT, lengthOf(CONTENT))).status).toBe(200)
    expect(await storedRow(h, id)).toEqual({
      file_key: activityFileKey(uid, id),
      file_size: CONTENT.byteLength,
    })
  })
})

describe('refusals happen before the body is read or hashed', () => {
  it('refuses an upload past the stored-bytes quota before reading the body', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const uid = await userId(h, token)
    const id = await idOf(await createActivity(h, token))
    await h.env.DB.prepare(
      `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
        digest_json, file_name, file_hash, file_size, created_at)
       VALUES ('filler', ?, 'filler', 'run', 1, 'filler', 1, '{}', 'f.fit', 'h', ?, 0)`,
    )
      .bind(uid, MAX_STORED_BYTES_PER_USER - 10)
      .run()
    const { body, pulls } = trackedBody(CONTENT)
    const res = await putFile(h, token, id, body, lengthOf(CONTENT))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: { code: 'storage_quota' } })
    expect(pulls()).toBe(0)
  })

  it('refuses an upload the R2 ledger would refuse before reading the body', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const uid = await userId(h, token)
    await h.env.DB.prepare(
      `INSERT INTO r2_storage_budget (id, lifetime_put_bytes, monthly_period, monthly_operations, monthly_put_bytes)
       VALUES (1, 0, '2026-01', 0, ${MAX_MONTHLY_R2_PUT_BYTES})
       ON CONFLICT(id) DO UPDATE SET monthly_period = '2026-01', monthly_operations = 0,
         monthly_put_bytes = ${MAX_MONTHLY_R2_PUT_BYTES}`,
    ).run()
    const { body, pulls } = trackedBody(CONTENT)
    const res = await putFile(h, token, id, body, lengthOf(CONTENT))
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: { code: 'storage_budget_exhausted' } })
    expect(pulls()).toBe(0)
    expect(await storedRow(h, id)).toEqual({ file_key: null, file_size: null })
    expect(await dailyUsed(h, uid, 'fileUpload')).toBe(0)
  })

  it('refuses an upload past the daily byte budget before reading the body', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const uid = await userId(h, token)
    await h.env.DB.prepare(
      'INSERT INTO daily_budget (user_id, day, action, used) VALUES (?, ?, ?, ?)',
    )
      .bind(uid, DAY, 'uploadBytes', DAILY_UPLOAD_BYTES - 10)
      .run()
    const { body, pulls } = trackedBody(CONTENT)
    const res = await putFile(h, token, id, body, lengthOf(CONTENT))
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: { code: 'daily_limit' } })
    expect(pulls()).toBe(0)
    expect(await storedRow(h, id)).toEqual({ file_key: null, file_size: null })
  })

  it('gives back the reservation, but keeps the daily charges of a body it read that fails its hash', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    const uid = await userId(h, token)
    const tampered = new TextEncoder().encode('tampered')
    const res = await putFile(h, token, id, tampered, lengthOf(tampered))
    expect(res.status).toBe(422)
    expect(await storedRow(h, id)).toEqual({ file_key: null, file_size: null })
    // The whole body was read before the hash failed, so a mismatched upload is not free.
    expect(await dailyUsed(h, uid, 'fileUpload')).toBe(1)
    expect(await dailyUsed(h, uid, 'uploadBytes')).toBe(tampered.byteLength)

    const retry = await putFile(h, token, id, CONTENT, lengthOf(CONTENT))
    expect(retry.status).toBe(200)
    expect(await h.env.FILES!.get(activityFileKey(uid, id))).not.toBeNull()
  })
})

describe('validation messages', () => {
  it('names the field of a digest that is not valid, and stays within the ApiError bound', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await createActivity(
      h,
      token,
      {},
      { hrBlocks: Array.from({ length: 2000 }, () => ({})) },
    )
    expect(res.status).toBe(400)
    const body = ApiErrorSchema.parse(await res.json())
    expect(body.error.code).toBe('invalid_request')
    // The digest reader stops at the first thing wrong, so the message is one issue, not 2,000.
    expect(body.error.message).toMatch(/^digest\.hrBlocks: /)
    expect(body.error.message.length).toBeLessThanOrEqual(1000)
  })
})

describe('upload profile units', () => {
  it('creates a profile an upload finds missing in the units of the upload language', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await idOf(await createActivity(h, token))
    await h.env.DB.prepare('DELETE FROM profiles').run()
    const res = await putFile(h, token, id, CONTENT, {
      ...lengthOf(CONTENT),
      'accept-language': 'en-US,en;q=0.9',
    })
    // Files are off by default, so the upload is refused once the profile exists.
    expect(res.status).toBe(409)
    const me = await h.send({ path: '/api/me', ...as(token) })
    expect(await me.json()).toMatchObject({ profile: { units: 'imperial' } })
  })
})
