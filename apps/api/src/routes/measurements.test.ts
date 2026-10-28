import { DAILY_LIMITS, MAX_MEASUREMENTS_PER_USER } from '@rca/contract'
import { describe, expect, it } from 'vitest'
import { createHarness, testEnv } from '../test/harness.ts'

const MASS = { kind: 'massKg', value: 82.5, from: '2024-03-01' }
const HEART_RATE = { kind: 'maxHeartRate', sport: 'run', value: 189, from: '2024-03-01' }

async function signedIn(email?: string) {
  const h = createHarness()
  const token = await h.signIn(email)
  const cookies = { rca_session: token }
  const put = (json: unknown) => h.send({ method: 'PUT', path: '/api/measurements', json, cookies })
  const list = async () =>
    ((await (await h.send({ path: '/api/measurements', cookies })).json()) as { items: unknown[] })
      .items
  return { h, cookies, put, list }
}

describe('GET /api/measurements', () => {
  it('requires a session', async () => {
    const h = createHarness()
    expect((await h.send({ path: '/api/measurements' })).status).toBe(401)
  })

  it('lists the account dated settings, earliest date first', async () => {
    const { put, list } = await signedIn()
    await put({ kind: 'thresholdPower', sport: 'ride', value: 250, from: '2025-01-01' })
    await put(MASS)
    await put(HEART_RATE)
    expect(await list()).toEqual([
      MASS,
      HEART_RATE,
      { kind: 'thresholdPower', sport: 'ride', value: 250, from: '2025-01-01' },
    ])
  })

  it('shows one account only its own settings', async () => {
    const mine = await signedIn('mine@example.com')
    await mine.put(MASS)
    const other = await signedIn('other@example.com')
    expect(await other.list()).toEqual([])
  })

  it('refuses a cross-site read, which would spend the reader budget', async () => {
    const { h, cookies } = await signedIn()
    const res = await h.send({
      path: '/api/measurements',
      cookies,
      headers: { 'Sec-Fetch-Site': 'cross-site' },
    })
    expect(res.status).toBe(403)
  })

  it('spends one measurementRead unit a read, then answers 429 daily_limit', async () => {
    const { h, cookies } = await signedIn()
    for (let i = 0; i < DAILY_LIMITS.measurementRead; i++) {
      expect((await h.send({ path: '/api/measurements', cookies })).status).toBe(200)
    }
    const res = await h.send({ path: '/api/measurements', cookies })
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: { code: 'daily_limit' } })
  })
})

describe('PUT /api/measurements', () => {
  it('stores an entry and answers with it', async () => {
    const { put, list } = await signedIn()
    const res = await put(HEART_RATE)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(HEART_RATE)
    expect(await list()).toEqual([HEART_RATE])
  })

  it('replaces the value for the same kind, sport and date, and keeps other dates', async () => {
    const { put, list } = await signedIn()
    await put(MASS)
    await put({ ...MASS, from: '2025-01-01', value: 80 })
    await put({ ...MASS, value: 83 })
    expect(await list()).toEqual([
      { ...MASS, value: 83 },
      { ...MASS, from: '2025-01-01', value: 80 },
    ])
  })

  it('keeps a heart rate for each sport on the same date', async () => {
    const { put, list } = await signedIn()
    await put(HEART_RATE)
    await put({ ...HEART_RATE, sport: 'ride', value: 181 })
    expect(await list()).toHaveLength(2)
  })

  it('requires the client header', async () => {
    const { h, cookies } = await signedIn()
    const res = await h.send({
      method: 'PUT',
      path: '/api/measurements',
      json: MASS,
      cookies,
      csrf: false,
    })
    expect(res.status).toBe(403)
  })

  it('requires a session', async () => {
    const h = createHarness()
    const res = await h.send({ method: 'PUT', path: '/api/measurements', json: MASS })
    expect(res.status).toBe(401)
  })

  it('refuses an account scope for another account', async () => {
    const { h, cookies } = await signedIn()
    const res = await h.send({
      method: 'PUT',
      path: '/api/measurements',
      json: MASS,
      cookies,
      headers: { 'X-RCA-User': 'someone-else' },
    })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: { code: 'account_changed' } })
  })

  it.each([
    ['a mass outside the limits', { ...MASS, value: 5 }],
    ['a sport on the body mass', { ...MASS, sport: 'run' }],
    ['a heart rate with no sport', { kind: 'maxHeartRate', value: 190, from: '2024-03-01' }],
    [
      'a threshold power for a run',
      { kind: 'thresholdPower', sport: 'run', value: 250, from: '2024-03-01' },
    ],
    [
      'a threshold pace for a ride',
      { kind: 'thresholdPace', sport: 'ride', value: 4, from: '2024-03-01' },
    ],
    ['a date that does not exist', { ...MASS, from: '2023-02-30' }],
    ['a date in the wrong form', { ...MASS, from: '1/3/2024' }],
    ['a year out of range', { ...MASS, from: '1900-01-01' }],
    ['an unknown kind', { kind: 'height', value: 180, from: '2024-03-01' }],
    ['an extra field', { ...MASS, note: 'x' }],
    ['a heart rate over the limit', { ...HEART_RATE, value: 400 }],
  ])('refuses %s with 400', async (_label, body) => {
    const { put, list } = await signedIn()
    const res = await put(body)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: { code: 'invalid_request' } })
    expect(await list()).toEqual([])
  })

  it('refuses a body over 1 KiB', async () => {
    const { h, cookies } = await signedIn()
    const res = await h.send({
      method: 'PUT',
      path: '/api/measurements',
      json: { ...MASS, padding: 'x'.repeat(2048) },
      cookies,
    })
    expect(res.status).toBe(413)
  })

  it('stops at the most entries a user may keep, but still lets a date be corrected', async () => {
    const { put } = await signedIn()
    const env = testEnv()
    const base = Date.UTC(2000, 0, 1)
    const day = (n: number) => new Date(base + n * 86_400_000).toISOString().slice(0, 10)
    const userId = (await env.DB.prepare('SELECT id FROM users LIMIT 1').first<{ id: string }>())
      ?.id
    // Fill the account in one statement, as the daily write budget would take months to.
    await env.DB.batch(
      Array.from({ length: MAX_MEASUREMENTS_PER_USER }, (_, n) =>
        env.DB.prepare(
          `INSERT INTO athlete_measurements (user_id, kind, sport, from_date, value, updated_at)
           VALUES (?, 'massKg', '', ?, 80, 0)`,
        ).bind(userId, day(n)),
      ),
    )
    const refused = await put({ ...MASS, from: '2030-01-01' })
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ error: { code: 'measurement_limit' } })
    const corrected = await put({ ...MASS, from: day(3), value: 71 })
    expect(corrected.status).toBe(200)
    // The refused write was refunded: only the corrected one used a unit.
    const used = await env.DB.prepare(
      "SELECT used FROM daily_budget WHERE action = 'measurementWrite'",
    ).first<{ used: number }>()
    expect(used?.used).toBe(1)
  })

  it('spends a measurementWrite unit a write, then answers 429 daily_limit', async () => {
    const { put } = await signedIn()
    for (let i = 0; i < DAILY_LIMITS.measurementWrite; i++) {
      expect((await put({ ...MASS, value: 70 + (i % 10) })).status).toBe(200)
    }
    const res = await put(MASS)
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: { code: 'daily_limit' } })
  })
})

describe('DELETE /api/measurements/:key', () => {
  it('deletes the entry the key names and nothing else', async () => {
    const { h, cookies, put, list } = await signedIn()
    await put(MASS)
    await put(HEART_RATE)
    const res = await h.send({
      method: 'DELETE',
      path: '/api/measurements/maxHeartRate.run.2024-03-01',
      cookies,
    })
    expect(res.status).toBe(204)
    expect(await list()).toEqual([MASS])
    const mass = await h.send({
      method: 'DELETE',
      path: '/api/measurements/massKg.2024-03-01',
      cookies,
    })
    expect(mass.status).toBe(204)
    expect(await list()).toEqual([])
  })

  it('answers 404 for a missing entry or a key that names none, and refunds the unit', async () => {
    const { h, cookies } = await signedIn()
    for (const key of [
      'massKg.2024-03-01',
      'maxHeartRate.run.2024-03-01',
      'bogus',
      'massKg.run.x',
    ]) {
      const res = await h.send({ method: 'DELETE', path: `/api/measurements/${key}`, cookies })
      expect(res.status).toBe(404)
    }
    const used = await testEnv()
      .DB.prepare("SELECT used FROM daily_budget WHERE action = 'measurementWrite'")
      .first<{ used: number }>()
    expect(used?.used ?? 0).toBe(0)
  })

  it("cannot delete another account's entry", async () => {
    const mine = await signedIn('mine@example.com')
    await mine.put(MASS)
    const other = await signedIn('other@example.com')
    const res = await other.h.send({
      method: 'DELETE',
      path: '/api/measurements/massKg.2024-03-01',
      cookies: other.cookies,
    })
    expect(res.status).toBe(404)
    expect(await mine.list()).toEqual([MASS])
  })

  it('requires the client header and a session', async () => {
    const { h, cookies } = await signedIn()
    const noHeader = await h.send({
      method: 'DELETE',
      path: '/api/measurements/massKg.2024-03-01',
      cookies,
      csrf: false,
    })
    expect(noHeader.status).toBe(403)
    const anonymous = await h.send({
      method: 'DELETE',
      path: '/api/measurements/massKg.2024-03-01',
    })
    expect(anonymous.status).toBe(401)
  })
})

describe('account deletion', () => {
  it("removes the account's dated settings and no one else's", async () => {
    const leaving = await signedIn('leaving@example.com')
    await leaving.put(MASS)
    await leaving.put(HEART_RATE)
    const staying = await signedIn('staying@example.com')
    await staying.put(MASS)

    const res = await leaving.h.send({
      method: 'DELETE',
      path: '/api/me',
      cookies: leaving.cookies,
    })
    expect(res.status).toBe(204)

    const rows = await testEnv()
      .DB.prepare('SELECT COUNT(*) AS n FROM athlete_measurements')
      .first<{ n: number }>()
    expect(rows?.n).toBe(1)
    expect(await staying.list()).toEqual([MASS])
  })
})
