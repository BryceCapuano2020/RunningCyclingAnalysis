import { DAILY_LIMITS, StateSnapshotSchema } from '@rca/contract'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { afterNewest, libraryDigests, seedDigests, stateWorld } from '../test/stateKit.ts'
import { createHarness } from '../test/harness.ts'
import { runStateJob } from '../state/job.ts'

const digests = libraryDigests()

async function ready(email?: string) {
  const w = await stateWorld({ email })
  w.h.clock.now = afterNewest(digests)
  await seedDigests(w.env.DB, w.userId, digests)
  await runStateJob(w.env, w.deps, w.userId)
  const found = await w.env.DB.prepare(
    'SELECT snapshot_hash AS h FROM state_jobs WHERE user_id = ?',
  )
    .bind(w.userId)
    .first<{ h: string }>()
  return {
    ...w,
    hash: found!.h,
    get: (headers: Record<string, string> = {}) =>
      w.h.send({ path: '/api/state', cookies: w.cookies, headers }),
  }
}

describe('GET /api/state', () => {
  it('serves the latest snapshot, which fits the contract, with its hash as the tag', async () => {
    const w = await ready()
    const res = await w.get()
    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).toBe(`"${w.hash}"`)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('X-State-Computed-Version')).toMatch(/^\d+$/)
    expect(res.headers.get('Content-Encoding')).toBeNull()
    const body = (await res.json()) as { libraryVersion: number; zone: string }
    expect(StateSnapshotSchema.safeParse(body).success).toBe(true)
    expect(body.zone).toBe('UTC')
  })

  it('serves the stored gzip as it is to a client that reads it', async () => {
    const w = await ready()
    const res = await w.get({ 'Accept-Encoding': 'gzip, br' })
    expect(res.headers.get('Content-Encoding')).toBe('gzip')
    const body = JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString())
    expect(StateSnapshotSchema.safeParse(body).success).toBe(true)
  })

  it('answers 304 to a matching tag without reading the object', async () => {
    const w = await ready()
    let reads = 0
    const watched = new Proxy(w.env.FILES!, {
      get(target, prop) {
        const value: unknown = Reflect.get(target, prop, target)
        if (prop === 'get') return () => void reads++
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const h = createHarness({}, { FILES: watched })
    h.clock.now = w.h.clock.now
    const res = await h.send({
      path: '/api/state',
      cookies: w.cookies,
      headers: { 'If-None-Match': `W/"nope", "${w.hash}"` },
    })
    expect(res.status).toBe(304)
    expect(res.headers.get('ETag')).toBe(`"${w.hash}"`)
    expect(reads).toBe(0)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect((await w.get({ 'If-None-Match': '"other"' })).status).toBe(200)
    expect((await w.get({ 'If-None-Match': '*' })).status).toBe(304)
  })

  it('answers a signed-out request 404', async () => {
    const w = await ready()
    expect((await w.h.send({ path: '/api/state' })).status).toBe(404)
    // A cross-site signed-out request, and a stale session, give nothing away either.
    expect(
      (await w.h.send({ path: '/api/state', headers: { 'Sec-Fetch-Site': 'cross-site' } })).status,
    ).toBe(404)
    expect(
      (await w.h.send({ path: '/api/state', cookies: { rca_session: 'not-a-session' } })).status,
    ).toBe(404)
  })

  it('serves an account only its own snapshot', async () => {
    const mine = await ready('mine@example.com')
    const token = await mine.h.signIn('other@example.com')
    const own = await mine.get()
    const res = await mine.h.send({ path: '/api/state', cookies: { rca_session: token } })
    // The other account has no library: its own (empty) results are computed, not mine.
    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).not.toBe(own.headers.get('ETag'))
    expect((await res.json()) as object).not.toEqual(await own.json())
  })

  it('computes the snapshot again in the read when the object the row names is gone, and keeps no unit for the lost read', async () => {
    const w = await ready()
    const key = `users/${w.userId}/state/${w.hash}.json.gz`
    await w.env.FILES!.delete(key)
    w.h.clock.now += 11_000
    const res = await w.get()
    expect(res.status).toBe(200)
    expect(await w.env.FILES!.head(key)).not.toBeNull()
    const spent = await w.env.DB.prepare(
      "SELECT coalesce(sum(used), 0) AS n FROM daily_budget WHERE action = 'stateRead'",
    ).first<{ n: number }>()
    expect(spent?.n).toBe(1)
  })

  it('refuses a cross-site read, which would spend the reader budget', async () => {
    const w = await ready()
    expect((await w.get({ 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403)
  })

  it('answers 429 daily_limit once the stateRead units are spent', async () => {
    const w = await ready()
    await w.env.DB.prepare(
      `INSERT INTO daily_budget (user_id, day, action, used) VALUES (?, ?, 'stateRead', ?)`,
    )
      .bind(w.userId, new Date(w.h.clock.now).toISOString().slice(0, 10), DAILY_LIMITS.stateRead)
      .run()
    const res = await w.get()
    expect(res.status).toBe(429)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('daily_limit')
  })
})
