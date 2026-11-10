import { DAILY_LIMITS } from '@rca/contract'
import { describe, expect, it } from 'vitest'
import { createHarness, testEnv } from '../test/harness.ts'

const NONE = { keepPower: null, countedRuns: null, period: null }
const SAVED = {
  keepPower: ['ride-b', 'ride-a'],
  countedRuns: ['run-1700000000', 'run-1700086400'],
  period: { from: '2025-01-01', to: '2025-02-01' },
}

async function signedIn(email?: string) {
  const h = createHarness()
  const token = await h.signIn(email)
  const cookies = { rca_session: token }
  const put = (json: unknown) => h.send({ method: 'PUT', path: '/api/settings', json, cookies })
  const get = async () => (await h.send({ path: '/api/settings', cookies })).json()
  return { h, cookies, put, get }
}

/** Sets how many units of an action the only user has used today (UTC). */
async function setUsed(used: number, action: string): Promise<void> {
  const env = testEnv()
  const user = await env.DB.prepare('SELECT id FROM users').first<{ id: string }>()
  await env.DB.prepare(
    `INSERT INTO daily_budget (user_id, day, action, used) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, day, action) DO UPDATE SET used = excluded.used`,
  )
    .bind(user?.id, '2026-01-15', action, used)
    .run()
}

describe('GET /api/settings', () => {
  it('requires a session', async () => {
    expect((await createHarness().send({ path: '/api/settings' })).status).toBe(401)
  })

  it('reads every field as never set before the first write', async () => {
    const { get } = await signedIn()
    expect(await get()).toEqual(NONE)
  })

  it('shows one account only its own settings', async () => {
    const mine = await signedIn('mine@example.com')
    await mine.put(SAVED)
    const other = await signedIn('other@example.com')
    expect(await other.get()).toEqual(NONE)
  })

  it('refuses a cross-site read, which would spend the reader budget', async () => {
    const { h, cookies } = await signedIn()
    const res = await h.send({
      path: '/api/settings',
      cookies,
      headers: { 'Sec-Fetch-Site': 'cross-site' },
    })
    expect(res.status).toBe(403)
  })

  it('answers 429 daily_limit once the settingsRead units are spent', async () => {
    const { h, cookies } = await signedIn()
    await setUsed(DAILY_LIMITS.settingsRead - 1, 'settingsRead')
    expect((await h.send({ path: '/api/settings', cookies })).status).toBe(200)
    const res = await h.send({ path: '/api/settings', cookies })
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: { code: 'daily_limit' } })
  })
})

describe('PUT /api/settings', () => {
  it('requires a session', async () => {
    expect(
      (await createHarness().send({ method: 'PUT', path: '/api/settings', json: NONE })).status,
    ).toBe(401)
  })

  it('stores the document and reads it back, an empty list being a choice and not "never set"', async () => {
    const { put, get } = await signedIn()
    const res = await put(SAVED)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(SAVED)
    expect(await get()).toEqual(SAVED)
    await put({ keepPower: [], countedRuns: [], period: 90 })
    expect(await get()).toEqual({ keepPower: [], countedRuns: [], period: 90 })
  })

  it('replaces the whole document, so a null clears the field', async () => {
    const { put, get } = await signedIn()
    await put(SAVED)
    await put({ ...SAVED, period: null, keepPower: null })
    expect(await get()).toEqual({ ...SAVED, period: null, keepPower: null })
  })

  it.each([
    ['an unknown field', { ...NONE, extra: 1 }],
    ['a missing field', { keepPower: null, countedRuns: null }],
    [
      'a ride list over the cap',
      { ...NONE, keepPower: Array.from({ length: 501 }, (_, i) => `r${i}`) },
    ],
    ['a ride id that is not text', { ...NONE, keepPower: [1] }],
    ['a count that is not a run key', { ...NONE, countedRuns: ['ride-1700000000'] }],
    [
      'a count over the cap',
      { ...NONE, countedRuns: Array.from({ length: 20_001 }, () => 'run-1') },
    ],
    ['the default period, which is null', { ...NONE, period: 'default' }],
    ['a period that is no choice', { ...NONE, period: 'forever' }],
    [
      'a custom range of no real day',
      { ...NONE, period: { from: '2025-13-01', to: '2025-02-01' } },
    ],
  ])('refuses %s with 400', async (_name, body) => {
    const { put, get } = await signedIn()
    const res = await put(body)
    expect(res.status).toBe(400)
    expect(await get()).toEqual(NONE)
  })

  it('rejects a body over 512 KiB with 413', async () => {
    const { h, cookies } = await signedIn()
    const res = await h.send({
      method: 'PUT',
      path: '/api/settings',
      cookies,
      json: { ...NONE, keepPower: ['x'.repeat(512 * 1024)] },
    })
    expect(res.status).toBe(413)
  })

  it('takes the most counted runs the app keeps', async () => {
    const { put } = await signedIn()
    const countedRuns = Array.from({ length: 20_000 }, (_, i) => `run-${1_700_000_000 + i}`)
    expect((await put({ ...NONE, countedRuns })).status).toBe(200)
  })

  it('answers 429 daily_limit once the settingsWrite units are spent, one unit a write', async () => {
    const { put } = await signedIn()
    await setUsed(DAILY_LIMITS.settingsWrite - 1, 'settingsWrite')
    expect((await put(SAVED)).status).toBe(200)
    const res = await put(SAVED)
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: { code: 'daily_limit' } })
  })

  it('keeps the zone the browser reports until another is sent, and shows none before one', async () => {
    const { put, get } = await signedIn()
    expect(await get()).not.toHaveProperty('zone')
    expect(await (await put({ ...SAVED, zone: 'Pacific/Auckland' })).json()).toMatchObject({
      zone: 'Pacific/Auckland',
    })
    // A write that leaves the zone out keeps the saved one.
    expect(await (await put(NONE)).json()).toEqual({ ...NONE, zone: 'Pacific/Auckland' })
    expect(await get()).toEqual({ ...NONE, zone: 'Pacific/Auckland' })
    expect(await (await put({ ...NONE, zone: 'Europe/Paris' })).json()).toMatchObject({
      zone: 'Europe/Paris',
    })
  })

  it('refuses a zone that is not a zone name', async () => {
    const { put } = await signedIn()
    for (const zone of ['Not/AZone', '', 5, 'x'.repeat(65)]) {
      expect((await put({ ...NONE, zone })).status, String(zone)).toBe(400)
    }
  })

  it('is removed with the account', async () => {
    const { put, h, cookies } = await signedIn()
    await put(SAVED)
    const res = await h.send({ method: 'DELETE', path: '/api/me', cookies })
    expect(res.status).toBeLessThan(300)
    const left = await testEnv().DB.prepare('SELECT COUNT(*) AS n FROM athlete_settings').first<{
      n: number
    }>()
    expect(left?.n).toBe(0)
  })
})
