import { describe, expect, it } from 'vitest'
import { MIN_GLOBAL_R2_PUT_CHARGE_BYTES } from '@rca/contract'
import { createHarness, digestFixture, START, type Harness } from '../test/harness.ts'
import { activityFileKey } from '../storage.ts'
import { sha256Hex } from '../util.ts'

/** Bytes that gzip to about half, as a FIT file does to a third: far inside the inflate ratio. */
function noisy(length: number): Uint8Array {
  let state = 12345
  return Uint8Array.from({ length }, () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return (state >> 16) % 16
  })
}
const FILE = noisy(20_000)
const FILE_HASH = await sha256Hex(FILE)
const DAY = new Date(START).toISOString().slice(0, 10)

async function gzipped(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

const as = (token: string) => ({ cookies: { rca_session: token } })

/** An activity of the user whose original is `FILE`, with files kept. */
async function activityFor(h: Harness, token: string, hash = FILE_HASH): Promise<string> {
  const kept = await h.send({
    method: 'PUT',
    path: '/api/profile',
    json: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: true },
    ...as(token),
  })
  expect(kept.status).toBe(200)
  const created = await h.send({
    method: 'POST',
    path: '/api/activities',
    json: { digest: digestFixture(), fileName: 'ride.fit', fileHash: hash },
    ...as(token),
  })
  return ((await created.json()) as { id: string }).id
}

function put(h: Harness, token: string, id: string, body: Uint8Array, encoding?: string) {
  return h.app.request(
    `/api/activities/${id}/file`,
    {
      method: 'PUT',
      headers: {
        'X-RCA-Client': 'web',
        cookie: `rca_session=${token}`,
        'content-length': String(body.byteLength),
        ...(encoding === undefined ? {} : { 'content-encoding': encoding }),
      },
      body,
      duplex: 'half',
    } as RequestInit,
    h.env,
  )
}

const stored = (h: Harness, id: string) =>
  h.env.DB.prepare('SELECT file_key, file_size FROM activities WHERE id = ?')
    .bind(id)
    .first<{ file_key: string | null; file_size: number | null }>()

describe('a gzipped upload', () => {
  it('is checked against the file itself, stored gzipped, and counted at the size stored', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await activityFor(h, token)
    const zipped = await gzipped(FILE)
    expect(zipped.byteLength).toBeLessThan(FILE.byteLength)

    const res = await put(h, token, id, zipped, 'gzip')

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id, hasFile: true, fileSize: zipped.byteLength })
    const me = (await (await h.send({ path: '/api/me', ...as(token) })).json()) as {
      user: { id: string }
    }
    const key = activityFileKey(me.user.id, id)
    expect(await stored(h, id)).toEqual({ file_key: key, file_size: zipped.byteLength })
    const object = await h.env.FILES!.get(key)
    expect(object?.httpMetadata?.contentEncoding).toBe('gzip')
    expect(new Uint8Array(await object!.arrayBuffer())).toEqual(zipped)
    // The object, the quota and the ledger count the bytes stored (the ledger charges at least one minimum PUT).
    const ledger = await h.env.DB.prepare(
      'SELECT lifetime_put_bytes FROM r2_storage_budget WHERE id = 1',
    ).first<{ lifetime_put_bytes: number }>()
    expect(ledger?.lifetime_put_bytes).toBe(
      Math.max(zipped.byteLength, MIN_GLOBAL_R2_PUT_CHARGE_BYTES),
    )
    const daily = await h.env.DB.prepare(
      "SELECT used FROM daily_budget WHERE user_id = ? AND day = ? AND action = 'uploadBytes'",
    )
      .bind(me.user.id, DAY)
      .first<{ used: number }>()
    // The unzipping is charged too, so the day's bytes are what the file unzipped to.
    expect(daily?.used).toBe(FILE.byteLength)
  })

  it('is sent back gzipped with its encoding named, and unzips to the file', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await activityFor(h, token)
    const zipped = await gzipped(FILE)
    await put(h, token, id, zipped, 'gzip')

    const res = await h.send({ path: `/api/activities/${id}/file`, ...as(token) })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-encoding')).toBe('gzip')
    expect(res.headers.get('content-length')).toBe(String(zipped.byteLength))
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(zipped)
  })

  it('leaves a file sent as it is stored as it is, with no encoding', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await activityFor(h, token)
    expect((await put(h, token, id, FILE)).status).toBe(200)

    const res = await h.send({ path: `/api/activities/${id}/file`, ...as(token) })

    expect(res.headers.get('content-encoding')).toBeNull()
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(FILE)
    expect((await stored(h, id))?.file_size).toBe(FILE.byteLength)
  })

  it('is refused when the file it holds is not the one the activity was made for', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await activityFor(h, token)
    const other = await gzipped(new TextEncoder().encode('another file entirely'))

    const res = await put(h, token, id, other, 'gzip')

    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ error: { code: 'hash_mismatch' } })
    expect(await stored(h, id)).toEqual({ file_key: null, file_size: null })
  })

  it('is refused when the bytes are not gzip, and the reservation is given back', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await activityFor(h, token)

    const res = await put(h, token, id, FILE, 'gzip')

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'bad_encoding' } })
    expect(await stored(h, id)).toEqual({ file_key: null, file_size: null })
  })

  it('is refused for an encoding the server does not read, before any charge', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await activityFor(h, token)

    const res = await put(h, token, id, FILE, 'br')

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'unsupported_encoding' } })
    expect(await stored(h, id)).toEqual({ file_key: null, file_size: null })
  })

  it('is refused when it inflates past the ratio, and the reservation is given back', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const zeros = new Uint8Array(2_000_000)
    const id = await activityFor(h, token, await sha256Hex(zeros))

    const res = await put(h, token, id, await gzipped(zeros), 'gzip')

    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({ error: { code: 'payload_too_large' } })
    expect(await stored(h, id)).toEqual({ file_key: null, file_size: null })
  })

  it('needs the same sign-in as a plain upload', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const id = await activityFor(h, token)

    const res = await put(h, 'not-a-session', id, await gzipped(FILE), 'gzip')

    expect(res.status).toBe(401)
  })
})
